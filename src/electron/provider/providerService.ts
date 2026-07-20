import { resolveProviderCommand, runCommand } from './command.js'
import { JsonRpcProcess, startJsonRpcProcess } from './jsonRpcProcess.js'
import type { ProviderId, ProviderModel, ProviderPrompt, ProviderReply, ProviderStatus } from './types.js'

const COMMAND_TIMEOUT_MS = 12_000
const PROMPT_TIMEOUT_MS = 120_000
const SAFE_MODEL_ID = /^[a-zA-Z0-9._:-]+$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_])([a-z])/g, (_, separator: string, letter: string) => `${separator === '-' ? ' ' : separator}${letter.toUpperCase()}`)
}

export function parseClaudeModels(help: string): ProviderModel[] {
  const modelHelp = help.match(/alias for the latest model\s*\(e\.g\.\s*([\s\S]*?)\)\s*or\s+a\s+model's full name/i)?.[1] ?? ''
  const aliases = [...modelHelp.matchAll(/'([a-zA-Z0-9._:-]+)'/g)].map((match) => match[1])
  return [...new Set(aliases)].map((id) => ({ id, name: `Claude ${titleCase(id)} (latest)` }))
}

function parseClaudeReply(stdout: string): string {
  let response: unknown
  try {
    response = JSON.parse(stdout)
  } catch {
    throw new Error(`Claude returned invalid JSON${stdout.trim() ? `: ${stdout.trim()}` : '.'}`)
  }
  if (!isObject(response)) throw new Error('Claude returned an unexpected response.')
  if (response.is_error === true) {
    throw new Error(typeof response.result === 'string' ? response.result : 'Claude reported an error.')
  }
  if (typeof response.result !== 'string') throw new Error('Claude returned no text response.')
  return response.result
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

  public async prompt(request: ProviderPrompt): Promise<ProviderReply> {
    if (!request.prompt.trim()) throw new Error('Enter a prompt before sending it.')
    if (!SAFE_MODEL_ID.test(request.modelId)) throw new Error('The selected model identifier is invalid.')
    return request.providerId === 'codex' ? this.promptCodex(request) : this.promptClaude(request)
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
    return value.data.flatMap((model): ProviderModel[] => !isObject(model) || typeof model.model !== 'string' ? [] : [{ id: model.model, name: typeof model.displayName === 'string' ? model.displayName : model.model }])
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

  private async promptCodex(request: ProviderPrompt): Promise<ProviderReply> {
    const command = await resolveProviderCommand('codex')
    const rpc = startJsonRpcProcess(command, ['app-server'])
    try {
      await rpc.request('initialize', { clientInfo: { name: 'omnidesign', title: 'OmniDesign', version: '0.0.0' }, capabilities: { experimentalApi: true } })
      rpc.notify('initialized')
      const thread = await rpc.request('thread/start', { cwd: process.cwd(), model: request.modelId, sandbox: 'read-only', approvalPolicy: 'never' })
      if (!isObject(thread) || !isObject(thread.thread) || typeof thread.thread.id !== 'string') throw new Error('Codex did not create a conversation.')
      return { providerId: 'codex', modelId: request.modelId, text: await this.collectCodexReply(rpc, thread.thread.id, request) }
    } finally { rpc.close() }
  }

  private async collectCodexReply(rpc: JsonRpcProcess, threadId: string, request: ProviderPrompt): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => done(new Error('Codex did not complete within two minutes.')), PROMPT_TIMEOUT_MS)
      const unsubscribe = rpc.onNotification((method, params) => {
        if (method === 'item/agentMessage/delta' && isObject(params) && typeof params.delta === 'string') output += params.delta
        if (method === 'turn/completed') done()
      })
      const done = (error?: Error) => { clearTimeout(timeout); unsubscribe(); if (error) reject(error); else resolve(output || 'Codex completed without a text response.') }
      void rpc.request('turn/start', { threadId, model: request.modelId, approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: true }, input: [{ type: 'text', text: request.prompt }] }).catch((error: unknown) => done(error instanceof Error ? error : new Error('Codex failed to start the turn.')))
    })
  }

  private async promptClaude(request: ProviderPrompt): Promise<ProviderReply> {
    const command = await resolveProviderCommand('claude')
    const result = await runCommand(command, ['-p', '--output-format', 'json', '--model', request.modelId, '--permission-mode', 'plan', '--no-session-persistence'], {
      input: request.prompt,
      timeoutMs: PROMPT_TIMEOUT_MS,
    })
    if (result.code !== 0) throw providerFailure('Claude', result.stdout, result.stderr)
    return { providerId: 'claude', modelId: request.modelId, text: parseClaudeReply(result.stdout) }
  }
}

export function isProviderId(value: unknown): value is ProviderId { return value === 'codex' || value === 'claude' }
