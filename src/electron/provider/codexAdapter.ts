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
import { formatTokenCount, friendlyToolAction, isObject, readFiniteNumber, titleCase } from './providerUtils.js'

function runtimeRoots(request: ProviderAdapterPrompt): string[] {
  return [...new Set([...(request.workspacePath ? [request.workspacePath] : []), ...(request.referencePaths ?? [])])]
}

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
    if (request.signal?.aborted) throw new Error('Codex generation was cancelled.')
    this.emit(onActivity, 'status', 'Starting Codex app-server')
    const command = await resolveProviderCommand('codex')
    // Run the app-server itself inside the design's Git repository so Codex operates on the design
    // (never OmniDesign's own source tree) even if it falls back to its process cwd.
    const rpc = startJsonRpcProcess(command, ['app-server'], request.workspacePath ? { cwd: request.workspacePath } : {})
    const cancel = () => rpc.close(new Error('Codex generation was cancelled.'))
    const runtimeWorkspaceRoots = runtimeRoots(request)
    request.signal?.addEventListener('abort', cancel, { once: true })
    try {
      await this.initialize(rpc)
      const thread = await rpc.request(request.resumeSessionId ? 'thread/resume' : 'thread/start', {
        ...(request.resumeSessionId ? { threadId: request.resumeSessionId, excludeTurns: true } : {}),
        cwd: request.workspacePath ?? process.cwd(),
        model: request.modelId,
        sandbox: request.workspacePath ? 'workspace-write' : 'read-only',
        approvalPolicy: 'never',
        ...(runtimeWorkspaceRoots.length ? { runtimeWorkspaceRoots } : {}),
        ...(request.instructions ? { developerInstructions: request.instructions } : {}),
      })
      if (!isObject(thread) || !isObject(thread.thread) || typeof thread.thread.id !== 'string') {
        throw new Error('Codex did not create a conversation.')
      }
      this.emit(onActivity, 'status', request.resumeSessionId ? 'Codex thread resumed' : 'Codex thread started', thread.thread.id, thread.thread.id)
      return { modelId: request.modelId, text: await this.collectReply(rpc, thread.thread.id, request, onActivity), sessionId: thread.thread.id }
    } finally {
      request.signal?.removeEventListener('abort', cancel)
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
    const runtimeWorkspaceRoots = runtimeRoots(request)
    return new Promise<string>((resolve, reject) => {
      let output = ''
      let usageDetail: string | undefined
      // No completion timeout: agents run until the turn completes, the process exits, or the user
      // cancels via the abort signal. A hung run is ended by Stop, not by an arbitrary clock.
      const unsubscribe = rpc.onNotification((method, params) => {
        const textDelta = method === 'item/agentMessage/delta' && isObject(params) && typeof params.delta === 'string'
          ? params.delta
          : undefined
        const toolDetail = method.startsWith('item/') ? describeCodexTool(params) : undefined
        if (textDelta) output += textDelta
        if (method === 'thread/tokenUsage/updated') usageDetail = describeCodexUsage(params) ?? usageDetail
        if (textDelta) this.emit(onActivity, 'text', 'Response update', textDelta)
        else if (method.includes('error')) this.emit(onActivity, 'diagnostic', 'Provider diagnostic', method)
        else if (toolDetail) this.emit(onActivity, 'tool', 'Agent action', toolDetail)
        else if (method === 'turn/completed') this.emit(onActivity, 'result', 'Completed', usageDetail)
        if (method === 'turn/completed') done()
      })
      const done = (error?: Error) => {
        unsubscribe()
        if (error) reject(error)
        else resolve(output || 'Codex completed without a text response.')
      }
      void rpc.request('turn/start', {
        threadId,
        model: request.modelId,
        ...(request.effort ? { effort: request.effort } : {}),
        approvalPolicy: 'never',
        sandboxPolicy: request.workspacePath
          ? { type: 'workspaceWrite', networkAccess: true, writableRoots: [] }
          : { type: 'readOnly', networkAccess: true },
        ...(request.workspacePath ? { cwd: request.workspacePath } : {}),
        ...(runtimeWorkspaceRoots.length ? { runtimeWorkspaceRoots } : {}),
        ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
        input: [{ type: 'text', text: request.prompt }],
      }).catch((error: unknown) => done(error instanceof Error ? error : new Error('Codex failed to start the turn.')))
    })
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

export function describeCodexUsage(params: unknown): string | undefined {
  if (!isObject(params) || !isObject(params.tokenUsage)) return undefined
  const usage = params.tokenUsage
  const last = isObject(usage.last) ? usage.last : undefined
  if (!last) return undefined
  const input = readFiniteNumber(last.inputTokens)
  const output = readFiniteNumber(last.outputTokens)
  const total = readFiniteNumber(last.totalTokens)
  const contextWindow = readFiniteNumber(usage.modelContextWindow)
  const parts: string[] = []
  if (input !== undefined) parts.push(`${formatTokenCount(input)} input`)
  if (output !== undefined) parts.push(`${formatTokenCount(output)} output`)
  if (total !== undefined && input === undefined && output === undefined) parts.push(`${formatTokenCount(total)} used`)
  if (contextWindow !== undefined) parts.push(`${formatTokenCount(contextWindow)} context`)
  return parts.length ? parts.join(' · ') : undefined
}

// Short, non-technical phrase for a Codex tool activity. The command text, file paths, and tool
// identifiers are intentionally omitted — a non-technical user cares about the intent, not the details.
export function describeCodexTool(params: unknown): string | undefined {
  if (!isObject(params) || !isObject(params.item) || typeof params.item.type !== 'string') return undefined
  switch (params.item.type) {
    case 'commandExecution':
      return friendlyToolAction('bash')
    case 'fileChange':
      return friendlyToolAction('edit')
    case 'webSearch':
      return friendlyToolAction('websearch')
    case 'imageGeneration':
      return 'Creating an image'
    case 'imageView':
      return friendlyToolAction('read')
    case 'mcpToolCall':
    case 'dynamicToolCall':
      return friendlyToolAction('')
    default:
      return undefined
  }
}
