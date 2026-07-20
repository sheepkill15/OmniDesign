import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { JsonRpcProcess, startJsonRpcProcess } from './jsonRpcProcess.js'
import type { ProviderId, ProviderModel, ProviderPrompt, ProviderReply, ProviderStatus } from './types.js'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 12_000
const CLAUDE_MODELS: readonly ProviderModel[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
]

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function textResult(value: unknown): string {
  if (!isObject(value) || typeof value.result !== 'string') throw new Error('Claude returned an unexpected response.')
  return value.result
}

export class ProviderService {
  public async discover(): Promise<ProviderStatus[]> {
    const [codex, claude] = await Promise.all([this.discoverCodex(), this.discoverClaude()])
    return [codex, claude]
  }

  public async prompt(request: ProviderPrompt): Promise<ProviderReply> {
    if (!request.prompt.trim()) throw new Error('Enter a prompt before sending it.')
    return request.providerId === 'codex' ? this.promptCodex(request) : this.promptClaude(request)
  }

  private async discoverCodex(): Promise<ProviderStatus> {
    let rpc: JsonRpcProcess | undefined
    try {
      rpc = startJsonRpcProcess('codex', ['app-server'])
      await rpc.request('initialize', { clientInfo: { name: 'omnidesign', title: 'OmniDesign', version: '0.0.0' }, capabilities: { experimentalApi: true } })
      rpc.notify('initialized')
      const [account, modelResult] = await Promise.all([rpc.request('account/read', {}), rpc.request('model/list', {})])
      const authenticated = isObject(account) && account.account !== null && account.account !== undefined
      return { id: 'codex', name: 'Codex', installed: true, authenticated, detail: authenticated ? 'Installed and signed in through your Codex subscription.' : 'Installed, but not signed in. Run codex login.', models: this.codexModels(modelResult) }
    } catch (error) {
      return { id: 'codex', name: 'Codex', installed: false, authenticated: false, detail: error instanceof Error ? `Unavailable: ${error.message}` : 'Codex CLI is unavailable.', models: [] }
    } finally { rpc?.close() }
  }

  private async discoverClaude(): Promise<ProviderStatus> {
    try {
      const [version, auth] = await Promise.all([
        execFileAsync('claude', ['--version'], { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }),
        execFileAsync('claude', ['auth', 'status', '--json'], { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }),
      ])
      const authStatus: unknown = JSON.parse(auth.stdout)
      const authenticated = isObject(authStatus) && authStatus.loggedIn === true
      return {
        id: 'claude', name: 'Claude', installed: true, authenticated,
        detail: authenticated ? `Installed (${version.stdout.trim()}) and signed in through your Claude subscription.` : 'Installed, but not signed in. Run claude auth login.',
        models: authenticated ? CLAUDE_MODELS : [],
      }
    } catch (error) {
      return { id: 'claude', name: 'Claude', installed: false, authenticated: false, detail: error instanceof Error ? `Unavailable: ${error.message}` : 'Claude Code is unavailable.', models: [] }
    }
  }

  private codexModels(value: unknown): ProviderModel[] {
    if (!isObject(value) || !Array.isArray(value.data)) return []
    return value.data.flatMap((model): ProviderModel[] => !isObject(model) || typeof model.model !== 'string' ? [] : [{ id: model.model, name: typeof model.displayName === 'string' ? model.displayName : model.model }])
  }

  private async promptCodex(request: ProviderPrompt): Promise<ProviderReply> {
    const rpc = startJsonRpcProcess('codex', ['app-server'])
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
      const timeout = setTimeout(() => done(new Error('Codex did not complete within two minutes.')), 120_000)
      const unsubscribe = rpc.onNotification((method, params) => {
        if (method === 'item/agentMessage/delta' && isObject(params) && typeof params.delta === 'string') output += params.delta
        if (method === 'turn/completed') done()
      })
      const done = (error?: Error) => { clearTimeout(timeout); unsubscribe(); if (error) reject(error); else resolve(output || 'Codex completed without a text response.') }
      void rpc.request('turn/start', { threadId, model: request.modelId, approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: true }, input: [{ type: 'text', text: request.prompt }] }).catch((error: unknown) => done(error instanceof Error ? error : new Error('Codex failed to start the turn.')))
    })
  }

  private async promptClaude(request: ProviderPrompt): Promise<ProviderReply> {
    const child = spawn('claude', ['-p', request.prompt, '--output-format', 'json', '--model', request.modelId, '--permission-mode', 'plan'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
    if (code !== 0) throw new Error(Buffer.concat(stderr).toString('utf8').trim() || 'Claude failed to answer.')
    return { providerId: 'claude', modelId: request.modelId, text: textResult(JSON.parse(Buffer.concat(stdout).toString('utf8'))) }
  }
}

export function isProviderId(value: unknown): value is ProviderId { return value === 'codex' || value === 'claude' }
