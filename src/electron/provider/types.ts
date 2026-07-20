export type ProviderId = 'codex' | 'claude'

export interface ProviderModel {
  readonly id: string
  readonly name: string
}

export interface ProviderStatus {
  readonly id: ProviderId
  readonly name: string
  readonly installed: boolean
  readonly authenticated: boolean
  readonly detail: string
  readonly models: readonly ProviderModel[]
}

export interface ProviderPrompt {
  readonly providerId: ProviderId
  readonly modelId: string
  readonly prompt: string
}

export interface ProviderReply {
  readonly providerId: ProviderId
  readonly modelId: string
  readonly text: string
}
