import type {
  ProviderActivity,
  ProviderId,
  ProviderPrompt,
  ProviderReply,
  ProviderStatus,
} from './types.js'

export type ProviderAdapterPrompt = Pick<ProviderPrompt, 'modelId' | 'effort' | 'prompt' | 'resumeSessionId'> & {
  readonly signal?: AbortSignal
  readonly workspacePath?: string
  readonly referencePaths?: readonly string[]
  readonly instructions?: string
}
export type ProviderAdapterReply = Omit<ProviderReply, 'providerId'>
export type ProviderAdapterActivity = Omit<ProviderActivity, 'requestId' | 'providerId'>
export type ProviderAdapterStatus = Omit<ProviderStatus, 'id'>
export type ProviderAdapterActivityListener = (activity: ProviderAdapterActivity) => void

export interface ProviderAdapter {
  readonly id: ProviderId
  discover(): Promise<ProviderAdapterStatus>
  prompt(request: ProviderAdapterPrompt, onActivity: ProviderAdapterActivityListener): Promise<ProviderAdapterReply>
}
