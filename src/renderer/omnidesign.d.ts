interface ProviderModel {
  readonly id: string
  readonly name: string
  readonly effortLevels: readonly ProviderEffortLevel[]
}

interface ProviderEffortLevel {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
}

interface ProviderStatus {
  readonly id: 'codex' | 'claude'
  readonly name: string
  readonly installed: boolean
  readonly authenticated: boolean
  readonly detail: string
  readonly models: readonly ProviderModel[]
}

interface ProviderReply {
  readonly providerId: 'codex' | 'claude'
  readonly modelId: string
  readonly text: string
}

interface ProviderActivity {
  readonly requestId: string
  readonly providerId: 'codex' | 'claude'
  readonly kind: 'status' | 'text' | 'tool' | 'result' | 'diagnostic'
  readonly label: string
  readonly detail?: string
}

interface Window {
  readonly omnidesign: {
    readonly providers: {
      discover(): Promise<ProviderStatus[]>
      prompt(request: { requestId: string; providerId: 'codex' | 'claude'; modelId: string; effort?: string; prompt: string }): Promise<ProviderReply>
      onActivity(listener: (activity: ProviderActivity) => void): () => void
    }
  }
}
