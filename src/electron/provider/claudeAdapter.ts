import { resolveProviderCommand, runCommand } from './command.js'
import type {
  ProviderAdapter,
  ProviderAdapterActivity,
  ProviderAdapterActivityListener,
  ProviderAdapterPrompt,
  ProviderAdapterReply,
  ProviderAdapterStatus,
} from './providerAdapter.js'
import type { ProviderEffortLevel, ProviderModel } from './types.js'
import { isObject, providerFailure, titleCase } from './providerUtils.js'

const COMMAND_TIMEOUT_MS = 12_000

export function parseClaudeEfforts(help: string): ProviderEffortLevel[] {
  const effortHelp = help.match(/--effort\s+<level>[\s\S]*?\(([a-z,\s]+)\)/i)?.[1] ?? ''
  return effortHelp.split(',').map((effort) => effort.trim()).filter(Boolean).map((id) => ({
    id,
    name: titleCase(id),
    isDefault: false,
  }))
}

export function parseClaudeModels(help: string): ProviderModel[] {
  const modelHelp = help.match(/alias for the latest model\s*\(e\.g\.\s*([\s\S]*?)\)\s*or\s+a\s+model's full name/i)?.[1] ?? ''
  const aliases = [...modelHelp.matchAll(/'([a-zA-Z0-9._:-]+)'/g)].map((match) => match[1])
  const effortLevels = parseClaudeEfforts(help)
  return [...new Set(aliases)].map((id) => ({ id, name: `Claude ${titleCase(id)} (latest)`, effortLevels }))
}

export class ClaudeAdapter implements ProviderAdapter {
  public readonly id = 'claude' as const

  public async discover(): Promise<ProviderAdapterStatus> {
    try {
      const command = await resolveProviderCommand('claude')
      const [version, auth, help] = await Promise.all([
        runCommand(command, ['--version'], { timeoutMs: COMMAND_TIMEOUT_MS }),
        runCommand(command, ['auth', 'status', '--json'], { timeoutMs: COMMAND_TIMEOUT_MS }),
        runCommand(command, ['--help'], { timeoutMs: COMMAND_TIMEOUT_MS }),
      ])
      if (version.code !== 0) throw providerFailure('Claude', version.stdout, version.stderr)
      if (auth.code !== 0) throw providerFailure('Claude', auth.stdout, auth.stderr)
      const authStatus: unknown = JSON.parse(auth.stdout)
      const authenticated = isObject(authStatus) && authStatus.loggedIn === true
      return {
        name: 'Claude',
        installed: true,
        authenticated,
        detail: authenticated
          ? `Installed (${version.stdout.trim()}) and signed in through your Claude subscription.`
          : 'Installed, but not signed in. Run claude auth login.',
        models: authenticated ? parseClaudeModels(`${help.stdout}\n${help.stderr}`) : [],
      }
    } catch (error) {
      return {
        name: 'Claude',
        installed: false,
        authenticated: false,
        detail: error instanceof Error ? `Unavailable: ${error.message}` : 'Claude Code is unavailable.',
        models: [],
      }
    }
  }

  public async prompt(request: ProviderAdapterPrompt, onActivity: ProviderAdapterActivityListener): Promise<ProviderAdapterReply> {
    this.emit(onActivity, 'status', 'Starting Claude Code')
    const command = await resolveProviderCommand('claude')
    let finalText = ''
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', request.modelId,
      ...(request.effort ? ['--effort', request.effort] : []),
      '--permission-mode', request.workspacePath ? 'acceptEdits' : 'plan',
      ...(request.referencePaths ?? []).flatMap((referencePath) => ['--add-dir', referencePath]),
      '--no-session-persistence',
      ...(request.instructions ? ['--append-system-prompt', request.instructions] : []),
      ...(request.outputSchema ? ['--json-schema', JSON.stringify(request.outputSchema)] : []),
    ]
    const result = await runCommand(command, args, {
      ...(request.workspacePath ? { cwd: request.workspacePath } : {}),
      input: request.prompt,
      // No prompt timeout: the agent runs until it finishes or the user cancels via the abort signal.
      ...(request.signal ? { signal: request.signal } : {}),
      onStdoutLine: (line) => {
        const parsed = this.readEvent(line)
        if (!parsed) {
          this.emit(onActivity, 'diagnostic', 'Unparsed Claude output', line)
          return
        }
        const view = this.describeEvent(parsed)
        if (!view) return
        if (view.finalText) finalText = view.finalText
        this.emit(onActivity, view.kind, view.label, view.detail)
      },
      onStderrLine: (line) => this.emit(onActivity, 'diagnostic', 'Claude stderr', line),
    })
    if (result.code !== 0) throw providerFailure('Claude', result.stdout, result.stderr)
    if (!finalText) throw new Error('Claude completed without a final text response.')
    return { modelId: request.modelId, text: finalText }
  }

  private readEvent(line: string): Record<string, unknown> | undefined {
    try {
      const event: unknown = JSON.parse(line)
      return isObject(event) ? event : undefined
    } catch {
      return undefined
    }
  }

  private describeEvent(event: Record<string, unknown>): {
    readonly kind: ProviderAdapterActivity['kind']
    readonly label: string
    readonly detail?: string
    readonly finalText?: string
  } | undefined {
    const type = typeof event.type === 'string' ? event.type : 'event'
    if (type === 'result') {
      const finalText = typeof event.result === 'string' ? event.result : undefined
      return { kind: 'result', label: 'Completed', ...(finalText ? { detail: finalText, finalText } : {}) }
    }
    if (type === 'system') {
      return { kind: 'status', label: 'Provider status', detail: typeof event.subtype === 'string' ? event.subtype : 'system' }
    }
    if (type === 'stream_event' && isObject(event.event)) {
      const streamEvent = event.event
      const delta = isObject(streamEvent.delta) && typeof streamEvent.delta.text === 'string'
        ? streamEvent.delta.text
        : undefined
      return delta ? { kind: 'text', label: 'Response update', detail: delta } : undefined
    }
    if ((type === 'assistant' || type === 'user') && isObject(event.message) && Array.isArray(event.message.content)) {
      const blocks = event.message.content.filter(isObject)
      const tool = blocks.find((block) => block.type === 'tool_use' || block.type === 'tool_result')
      if (tool) {
        const toolName = typeof tool.name === 'string' ? tool.name : typeof tool.type === 'string' ? tool.type : 'tool'
        return { kind: 'tool', label: 'Agent action', detail: `${toolName}: ${JSON.stringify(tool.input ?? tool.content ?? {})}` }
      }
      const text = blocks.find((block) => block.type === 'text' && typeof block.text === 'string')?.text
      return typeof text === 'string' ? { kind: 'text', label: 'Response update', detail: text } : undefined
    }
    return undefined
  }

  private emit(
    listener: ProviderAdapterActivityListener,
    kind: ProviderAdapterActivity['kind'],
    label: string,
    detail?: string,
  ): void {
    listener({
      kind,
      label,
      ...(detail ? { detail } : {}),
    })
  }
}
