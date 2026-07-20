interface ProviderModel {
  readonly id: string
  readonly name: string
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

interface Window {
  readonly omnidesign: {
    readonly providers: {
      discover(): Promise<ProviderStatus[]>
      prompt(request: { providerId: 'codex' | 'claude'; modelId: string; prompt: string }): Promise<ProviderReply>
    }
  }
}
