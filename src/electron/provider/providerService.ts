import { ClaudeAdapter } from './claudeAdapter.js'
import { CodexAdapter } from './codexAdapter.js'
import { agentCompletionOutputSchema, createDesignAgentInstructions, parseAgentCompletionPayload } from './agentHarness.js'
import type { ProviderAdapter, ProviderAdapterPrompt } from './providerAdapter.js'
import type { ProviderActivity, ProviderId, ProviderPrompt, ProviderReply, ProviderStatus } from './types.js'

const SAFE_CAPABILITY_ID = /^[a-zA-Z0-9._:-]+$/
const BUILT_IN_PROVIDER_IDS: readonly ProviderId[] = ['codex', 'claude']
type ActivityListener = (activity: ProviderActivity) => void

export interface DesignAgentRequest extends ProviderPrompt {
  readonly workspacePath: string
}

export interface DesignAgentReply extends Omit<ProviderReply, 'text'> {
  readonly response: string
}

export class ProviderService {
  private readonly adapters: ReadonlyMap<ProviderId, ProviderAdapter>

  public constructor(adapters: readonly ProviderAdapter[] = [new CodexAdapter(), new ClaudeAdapter()]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]))
    if (this.adapters.size !== adapters.length) throw new Error('Provider adapter identifiers must be unique.')
  }

  public async discover(): Promise<ProviderStatus[]> {
    return Promise.all([...this.adapters.values()].map(async (adapter) => ({ id: adapter.id, ...await adapter.discover() })))
  }

  public async prompt(request: ProviderPrompt, onActivity: ActivityListener = () => undefined): Promise<ProviderReply> {
    this.validatePrompt(request)
    const adapter = this.adapters.get(request.providerId)
    if (!adapter) throw new Error(`Provider adapter "${request.providerId}" is not registered.`)

    const adapterRequest: ProviderAdapterPrompt = {
      modelId: request.modelId,
      prompt: request.prompt,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.effort ? { effort: request.effort } : {}),
    }
    const reply = await adapter.prompt(adapterRequest, (activity) => {
      onActivity({ requestId: request.requestId, providerId: adapter.id, ...activity })
    })
    return { providerId: adapter.id, ...reply }
  }

  public async runDesignAgent(request: DesignAgentRequest, onActivity: ActivityListener = () => undefined): Promise<DesignAgentReply> {
    if (!request.workspacePath || !/^(?:[A-Za-z]:\\|\/)/.test(request.workspacePath)) {
      throw new Error('The design workspace path must be absolute.')
    }
    this.validatePrompt(request)
    const adapter = this.adapters.get(request.providerId)
    if (!adapter) throw new Error(`Provider adapter "${request.providerId}" is not registered.`)
    const reply = await adapter.prompt({
      modelId: request.modelId,
      prompt: request.prompt,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.effort ? { effort: request.effort } : {}),
      workspacePath: request.workspacePath,
      instructions: createDesignAgentInstructions(request.workspacePath),
      outputSchema: agentCompletionOutputSchema,
    }, (activity) => onActivity({ requestId: request.requestId, providerId: adapter.id, ...activity }))
    const completion = parseAgentCompletionPayload(reply.text)
    return { providerId: adapter.id, modelId: reply.modelId, response: completion.response }
  }

  private validatePrompt(request: ProviderPrompt): void {
    if (!request.prompt.trim()) throw new Error('Enter a prompt before sending it.')
    if (!SAFE_CAPABILITY_ID.test(request.modelId)) throw new Error('The selected model identifier is invalid.')
    if (request.effort && !SAFE_CAPABILITY_ID.test(request.effort)) throw new Error('The selected effort level is invalid.')
  }
}

export function isProviderId(value: unknown): value is ProviderId {
  return BUILT_IN_PROVIDER_IDS.some((providerId) => providerId === value)
}
