import { resolveProviderCommand, runCommand } from './command.js'
import { JsonRpcProcess, startJsonRpcProcess } from './jsonRpcProcess.js'
import type {
  ProviderActivity,
  ProviderEffortLevel,
  ProviderId,
  ProviderModel,
  ProviderPrompt,
  ProviderReply,
  ProviderStatus,
} from './types.js'

const COMMAND_TIMEOUT_MS = 12_000
const PROMPT_TIMEOUT_MS = 120_000
const SAFE_MODEL_ID = /^[a-zA-Z0-9._:-]+$/
type ActivityListener = (activity: ProviderActivity) => void

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_])([a-z])/g, (_, separator: string, letter: string) => `${separator === '-' ? ' ' : separator}${letter.toUpperCase()}`)
}

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

export function providerFailure(provider: string, stdout: string, stderr: string): Error {
  const detail = stderr.trim() || stdout.trim()
  if (!detail) return new Error(`${provider} exited without diagnostic output.`)
  try {
    const payload: unknown = JSON.parse(detail)
    if (isObject(payload) && typeof payload.result === 'string') return new Error(payload.result)
  } catch {
    // Preserve ordinary CLI diagnostics verbatim.
  }
  return new Error(detail)
}

export class ProviderService {
  public async discover(): Promise<ProviderStatus[]> {
    const [codex, claude] = await Promise.all([this.discoverCodex(), this.discoverClaude()])
    return [codex, claude]
  }

  public async prompt(request: ProviderPrompt, onActivity: ActivityListener = () => undefined): Promise<ProviderReply> {
    if (!request.prompt.trim()) throw new Error('Enter a prompt before sending it.')
    if (!SAFE_MODEL_ID.test(request.modelId)) throw new Error('The selected model identifier is invalid.')
    if (request.effort && !SAFE_MODEL_ID.test(request.effort)) throw new Error('The selected effort level is invalid.')
    return request.providerId === 'codex' ? this.promptCodex(request, onActivity) : this.promptClaude(request, onActivity)
  }

  private async discoverCodex(): Promise<ProviderStatus> {
    let rpc: JsonRpcProcess | undefined
    try {
      const command = await resolveProviderCommand('codex')
      rpc = startJsonRpcProcess(command, ['app-server'])
      await rpc.request('initialize', { clientInfo: { name: 'omnidesign', title: 'OmniDesign', version: '0.0.0' }, capabilities: { experimentalApi: true } })
      rpc.notify('initialized')
      const [account, models] = await Promise.all([rpc.request('account/read', {}), this.requestCodexModels(rpc)])
      const authenticated = isObject(account) && account.account !== null && account.account !== undefined
      return { id: 'codex', name: 'Codex', installed: true, authenticated, detail: authenticated ? 'Installed and signed in through your Codex subscription.' : 'Installed, but not signed in. Run codex login.', models }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Codex CLI is unavailable.'
      return {
        id: 'codex', name: 'Codex', installed: false, authenticated: false,
        detail: `Unavailable: ${detail} The Codex Desktop-bundled executable is not a supported substitute; install the Codex CLI so codex --version works from a terminal.`,
        models: [],
      }
    } finally { rpc?.close() }
  }

  private async discoverClaude(): Promise<ProviderStatus> {
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
      const models = authenticated ? parseClaudeModels(`${help.stdout}\n${help.stderr}`) : []
      return {
        id: 'claude', name: 'Claude', installed: true, authenticated,
        detail: authenticated ? `Installed (${version.stdout.trim()}) and signed in through your Claude subscription.` : 'Installed, but not signed in. Run claude auth login.',
        models,
      }
    } catch (error) {
      return { id: 'claude', name: 'Claude', installed: false, authenticated: false, detail: error instanceof Error ? `Unavailable: ${error.message}` : 'Claude Code is unavailable.', models: [] }
    }
  }

  private codexModels(value: unknown): ProviderModel[] {
    if (!isObject(value) || !Array.isArray(value.data)) return []
    return value.data.flatMap((model): ProviderModel[] => {
      if (!isObject(model) || typeof model.model !== 'string') return []
      const supported = Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []
      const effortLevels = supported.flatMap((option): ProviderEffortLevel[] => {
        if (!isObject(option) || typeof option.reasoningEffort !== 'string') return []
        return [{
          id: option.reasoningEffort,
          name: titleCase(option.reasoningEffort),
          isDefault: option.reasoningEffort === model.defaultReasoningEffort,
        }]
      })
      return [{
        id: model.model,
        name: typeof model.displayName === 'string' ? model.displayName : model.model,
        effortLevels,
      }]
    })
  }

  private async requestCodexModels(rpc: JsonRpcProcess): Promise<ProviderModel[]> {
    const models: ProviderModel[] = []
    let cursor: string | undefined
    do {
      const page = await rpc.request('model/list', cursor ? { cursor } : {})
      models.push(...this.codexModels(page))
      cursor = isObject(page) && typeof page.nextCursor === 'string' ? page.nextCursor : undefined
    } while (cursor)
    return models
  }

  private async promptCodex(request: ProviderPrompt, onActivity: ActivityListener): Promise<ProviderReply> {
    this.emit(onActivity, request, 'status', 'Starting Codex app-server')
    const command = await resolveProviderCommand('codex')
    const rpc = startJsonRpcProcess(command, ['app-server'])
    try {
      await rpc.request('initialize', { clientInfo: { name: 'omnidesign', title: 'OmniDesign', version: '0.0.0' }, capabilities: { experimentalApi: true } })
      rpc.notify('initialized')
      const thread = await rpc.request('thread/start', { cwd: process.cwd(), model: request.modelId, sandbox: 'read-only', approvalPolicy: 'never' })
      if (!isObject(thread) || !isObject(thread.thread) || typeof thread.thread.id !== 'string') throw new Error('Codex did not create a conversation.')
      this.emit(onActivity, request, 'status', 'Codex thread started', thread.thread.id)
      return { providerId: 'codex', modelId: request.modelId, text: await this.collectCodexReply(rpc, thread.thread.id, request, onActivity) }
    } finally { rpc.close() }
  }

  private async collectCodexReply(rpc: JsonRpcProcess, threadId: string, request: ProviderPrompt, onActivity: ActivityListener): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => done(new Error('Codex did not complete within two minutes.')), PROMPT_TIMEOUT_MS)
      const unsubscribe = rpc.onNotification((method, params) => {
        const textDelta = method === 'item/agentMessage/delta' && isObject(params) && typeof params.delta === 'string' ? params.delta : undefined
        if (textDelta) output += textDelta
        const kind = textDelta ? 'text' : method.includes('error') ? 'diagnostic' : method.startsWith('item/') ? 'tool' : method === 'turn/completed' ? 'result' : 'raw'
        this.emit(onActivity, request, kind, method, textDelta, params)
        if (method === 'turn/completed') done()
      })
      const done = (error?: Error) => { clearTimeout(timeout); unsubscribe(); if (error) reject(error); else resolve(output || 'Codex completed without a text response.') }
      void rpc.request('turn/start', {
        threadId,
        model: request.modelId,
        ...(request.effort ? { effort: request.effort } : {}),
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: true },
        input: [{ type: 'text', text: request.prompt }],
      }).catch((error: unknown) => done(error instanceof Error ? error : new Error('Codex failed to start the turn.')))
    })
  }

  private async promptClaude(request: ProviderPrompt, onActivity: ActivityListener): Promise<ProviderReply> {
    this.emit(onActivity, request, 'status', 'Starting Claude Code')
    const command = await resolveProviderCommand('claude')
    let finalText = ''
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', request.modelId,
      ...(request.effort ? ['--effort', request.effort] : []),
      '--permission-mode', 'plan',
      '--no-session-persistence',
    ]
    const result = await runCommand(command, args, {
      input: request.prompt,
      timeoutMs: PROMPT_TIMEOUT_MS,
      onStdoutLine: (line) => {
        const parsed = this.readClaudeEvent(line)
        if (!parsed) {
          this.emit(onActivity, request, 'diagnostic', 'Unparsed Claude output', line)
          return
        }
        const view = this.describeClaudeEvent(parsed)
        if (view.finalText) finalText = view.finalText
        this.emit(onActivity, request, view.kind, view.label, view.detail, parsed)
      },
      onStderrLine: (line) => this.emit(onActivity, request, 'diagnostic', 'Claude stderr', line),
    })
    if (result.code !== 0) throw providerFailure('Claude', result.stdout, result.stderr)
    if (!finalText) throw new Error('Claude completed without a final text response.')
    return { providerId: 'claude', modelId: request.modelId, text: finalText }
  }

  private readClaudeEvent(line: string): Record<string, unknown> | undefined {
    try {
      const event: unknown = JSON.parse(line)
      return isObject(event) ? event : undefined
    } catch {
      return undefined
    }
  }

  private describeClaudeEvent(event: Record<string, unknown>): {
    readonly kind: ProviderActivity['kind']
    readonly label: string
    readonly detail?: string
    readonly finalText?: string
  } {
    const type = typeof event.type === 'string' ? event.type : 'event'
    if (type === 'result') {
      const finalText = typeof event.result === 'string' ? event.result : undefined
      return { kind: 'result', label: 'Claude completed', ...(finalText ? { detail: finalText, finalText } : {}) }
    }
    if (type === 'system') {
      return { kind: 'status', label: `Claude ${typeof event.subtype === 'string' ? event.subtype : 'system'}` }
    }
    if (type === 'stream_event' && isObject(event.event)) {
      const streamEvent = event.event
      const delta = isObject(streamEvent.delta) && typeof streamEvent.delta.text === 'string' ? streamEvent.delta.text : undefined
      return { kind: delta ? 'text' : 'raw', label: typeof streamEvent.type === 'string' ? streamEvent.type : 'Claude stream event', ...(delta ? { detail: delta } : {}) }
    }
    if ((type === 'assistant' || type === 'user') && isObject(event.message) && Array.isArray(event.message.content)) {
      const blocks = event.message.content.filter(isObject)
      const tool = blocks.find((block) => block.type === 'tool_use' || block.type === 'tool_result')
      if (tool) {
        const toolName = typeof tool.name === 'string' ? tool.name : typeof tool.type === 'string' ? tool.type : 'tool'
        return { kind: 'tool', label: `Claude ${toolName}`, detail: JSON.stringify(tool.input ?? tool.content ?? {}) }
      }
      const text = blocks.find((block) => block.type === 'text' && typeof block.text === 'string')?.text
      return { kind: text ? 'text' : 'raw', label: `Claude ${type}`, ...(typeof text === 'string' ? { detail: text } : {}) }
    }
    return { kind: 'raw', label: `Claude ${type}` }
  }

  private emit(
    listener: ActivityListener,
    request: ProviderPrompt,
    kind: ProviderActivity['kind'],
    label: string,
    detail?: string,
    raw?: unknown,
  ): void {
    listener({
      requestId: request.requestId,
      providerId: request.providerId,
      kind,
      label,
      ...(detail ? { detail } : {}),
      ...(raw !== undefined ? { raw } : {}),
    })
  }
}

export function isProviderId(value: unknown): value is ProviderId { return value === 'codex' || value === 'claude' }
