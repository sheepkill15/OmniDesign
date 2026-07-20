import { resolveProviderCommand } from './command.js'
import { JsonRpcProcess, startJsonRpcProcess } from './jsonRpcProcess.js'
import type {
  ProviderAdapter,
  ProviderAdapterActivity,
  ProviderAdapterActivityListener,
  ProviderAdapterPrompt,
  ProviderAdapterReply,
  ProviderAdapterStatus,
} from './providerAdapter.js'
import type { ProviderEffortLevel, ProviderModel } from './types.js'
import { isObject, titleCase } from './providerUtils.js'

const PROMPT_TIMEOUT_MS = 120_000

export class CodexAdapter implements ProviderAdapter {
  public readonly id = 'codex' as const

  public async discover(): Promise<ProviderAdapterStatus> {
    let rpc: JsonRpcProcess | undefined
    try {
      const command = await resolveProviderCommand('codex')
      rpc = startJsonRpcProcess(command, ['app-server'])
      await this.initialize(rpc)
      const [account, models] = await Promise.all([rpc.request('account/read', {}), this.requestModels(rpc)])
      const authenticated = isObject(account) && account.account !== null && account.account !== undefined
      return {
        name: 'Codex',
        installed: true,
        authenticated,
        detail: authenticated
          ? 'Installed and signed in through your Codex subscription.'
          : 'Installed, but not signed in. Run codex login.',
        models,
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Codex CLI is unavailable.'
      return {
        name: 'Codex',
        installed: false,
        authenticated: false,
        detail: `Unavailable: ${detail} The Codex Desktop-bundled executable is not a supported substitute; install the Codex CLI so codex --version works from a terminal.`,
        models: [],
      }
    } finally {
      rpc?.close()
    }
  }

  public async prompt(request: ProviderAdapterPrompt, onActivity: ProviderAdapterActivityListener): Promise<ProviderAdapterReply> {
    this.emit(onActivity, 'status', 'Starting Codex app-server')
    const command = await resolveProviderCommand('codex')
    const rpc = startJsonRpcProcess(command, ['app-server'])
    try {
      await this.initialize(rpc)
      const thread = await rpc.request('thread/start', {
        cwd: process.cwd(),
        model: request.modelId,
        sandbox: 'read-only',
        approvalPolicy: 'never',
      })
      if (!isObject(thread) || !isObject(thread.thread) || typeof thread.thread.id !== 'string') {
        throw new Error('Codex did not create a conversation.')
      }
      this.emit(onActivity, 'status', 'Codex thread started', thread.thread.id)
      return { modelId: request.modelId, text: await this.collectReply(rpc, thread.thread.id, request, onActivity) }
    } finally {
      rpc.close()
    }
  }

  private async initialize(rpc: JsonRpcProcess): Promise<void> {
    await rpc.request('initialize', {
      clientInfo: { name: 'omnidesign', title: 'OmniDesign', version: '0.0.0' },
      capabilities: { experimentalApi: true },
    })
    rpc.notify('initialized')
  }

  private parseModels(value: unknown): ProviderModel[] {
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

  private async requestModels(rpc: JsonRpcProcess): Promise<ProviderModel[]> {
    const models: ProviderModel[] = []
    let cursor: string | undefined
    do {
      const page = await rpc.request('model/list', cursor ? { cursor } : {})
      models.push(...this.parseModels(page))
      cursor = isObject(page) && typeof page.nextCursor === 'string' ? page.nextCursor : undefined
    } while (cursor)
    return models
  }

  private async collectReply(
    rpc: JsonRpcProcess,
    threadId: string,
    request: ProviderAdapterPrompt,
    onActivity: ProviderAdapterActivityListener,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => done(new Error('Codex did not complete within two minutes.')), PROMPT_TIMEOUT_MS)
      const unsubscribe = rpc.onNotification((method, params) => {
        const textDelta = method === 'item/agentMessage/delta' && isObject(params) && typeof params.delta === 'string'
          ? params.delta
          : undefined
        const toolDetail = method.startsWith('item/') ? describeCodexTool(params) : undefined
        if (textDelta) output += textDelta
        if (textDelta) this.emit(onActivity, 'text', 'Response update', textDelta)
        else if (method.includes('error')) this.emit(onActivity, 'diagnostic', 'Provider diagnostic', method)
        else if (toolDetail) this.emit(onActivity, 'tool', 'Agent action', toolDetail)
        else if (method === 'turn/completed') this.emit(onActivity, 'result', 'Completed')
        if (method === 'turn/completed') done()
      })
      const done = (error?: Error) => {
        clearTimeout(timeout)
        unsubscribe()
        if (error) reject(error)
        else resolve(output || 'Codex completed without a text response.')
      }
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

export function describeCodexTool(params: unknown): string | undefined {
  if (!isObject(params) || !isObject(params.item) || typeof params.item.type !== 'string') return undefined
  const item = params.item
  if (item.type === 'commandExecution') return typeof item.command === 'string' ? `Command: ${item.command}` : 'Command execution'
  if (item.type === 'fileChange') return 'File change'
  if (item.type === 'mcpToolCall') {
    const name = [item.server, item.tool].filter((value) => typeof value === 'string').join('/')
    return name || 'MCP tool call'
  }
  if (item.type === 'dynamicToolCall') return typeof item.tool === 'string' ? item.tool : 'Tool call'
  if (item.type === 'webSearch') return typeof item.query === 'string' ? `Web search: ${item.query}` : 'Web search'
  if (item.type === 'imageView') return 'View image'
  if (item.type === 'imageGeneration') return 'Generate image'
  return undefined
}
