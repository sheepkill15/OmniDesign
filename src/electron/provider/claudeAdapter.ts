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
import { formatTokenCount, friendlyToolAction, isObject, providerFailure, readFiniteNumber, titleCase } from './providerUtils.js'

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
    let sessionId = request.resumeSessionId
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', request.modelId,
      ...(request.effort ? ['--effort', request.effort] : []),
      '--permission-mode', request.workspacePath ? 'acceptEdits' : 'plan',
      ...(request.referencePaths ?? []).flatMap((referencePath) => ['--add-dir', referencePath]),
      ...(request.resumeSessionId ? ['--resume', request.resumeSessionId] : []),
      ...(!request.workspacePath ? ['--no-session-persistence'] : []),
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
        if (view.sessionId) sessionId = view.sessionId
        this.emit(onActivity, view.kind, view.label, view.detail, view.sessionId)
      },
      onStderrLine: (line) => this.emit(onActivity, 'diagnostic', 'Claude stderr', line),
    })
    if (result.code !== 0) throw providerFailure('Claude', result.stdout, result.stderr)
    if (!finalText) throw new Error('Claude completed without a final text response.')
    return { modelId: request.modelId, text: finalText, ...(sessionId ? { sessionId } : {}) }
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
    readonly sessionId?: string
  } | undefined {
    const type = typeof event.type === 'string' ? event.type : 'event'
    if (type === 'result') {
      const finalText = typeof event.result === 'string' ? event.result : undefined
      const detail = describeClaudeResult(event)
      return { kind: 'result', label: 'Completed', ...(detail ? { detail } : {}), ...(finalText ? { finalText } : {}) }
    }
    if (type === 'system') {
      const sessionId = typeof event.session_id === 'string' ? event.session_id : undefined
      return { kind: 'status', label: 'Provider status', detail: typeof event.subtype === 'string' ? event.subtype : 'system', ...(sessionId ? { sessionId } : {}) }
    }
    // Only assistant events are the agent's own conversation. `user` events are tool results and
    // CLI-injected reminders (e.g. structured-output enforcement) that must never bleed into the reply.
    if (type === 'assistant' && isObject(event.message) && Array.isArray(event.message.content)) {
      const blocks = event.message.content.filter(isObject)
      const tool = blocks.find((block) => block.type === 'tool_use')
      if (tool) {
        const toolName = typeof tool.name === 'string' ? tool.name : 'tool'
        return { kind: 'tool', label: 'Agent action', detail: friendlyToolAction(toolName) }
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
    sessionId?: string,
  ): void {
    listener({
      kind,
      label,
      ...(detail ? { detail } : {}),
      ...(sessionId ? { sessionId } : {}),
    })
  }
}

export function describeClaudeResult(event: Record<string, unknown>): string | undefined {
  const turns = readFiniteNumber(event.num_turns)
  const cost = readFiniteNumber(event.total_cost_usd)
  const usage = isObject(event.usage) ? event.usage : undefined
  const input = usage ? readFiniteNumber(usage.input_tokens) : undefined
  const output = usage ? readFiniteNumber(usage.output_tokens) : undefined
  const parts: string[] = []
  if (turns !== undefined) parts.push(`${Math.round(turns).toLocaleString('en-US')} turn${Math.round(turns) === 1 ? '' : 's'}`)
  if (input !== undefined) parts.push(`${formatTokenCount(input)} input`)
  if (output !== undefined) parts.push(`${formatTokenCount(output)} output`)
  if (cost !== undefined) {
    const fractionDigits = cost === 0 || cost >= 0.01 ? 2 : cost >= 0.0001 ? 4 : 6
    parts.push(cost.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }))
  }
  return parts.length ? parts.join(' · ') : undefined
}
