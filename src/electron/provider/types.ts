export type ProviderId = 'codex' | 'claude'

export interface ProviderModel {
  readonly id: string
  readonly name: string
  readonly effortLevels: readonly ProviderEffortLevel[]
}

export interface ProviderEffortLevel {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
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
  readonly requestId: string
  readonly providerId: ProviderId
  readonly modelId: string
  readonly effort?: string
  readonly prompt: string
  readonly referencePaths?: readonly string[]
  readonly signal?: AbortSignal
}

export interface ProviderReply {
  readonly providerId: ProviderId
  readonly modelId: string
  readonly text: string
}

export type ProviderActivityKind = 'status' | 'text' | 'tool' | 'result' | 'diagnostic'

export interface ProviderActivity {
  readonly requestId: string
  readonly providerId: ProviderId
  readonly kind: ProviderActivityKind
  readonly label: string
  readonly detail?: string
}
