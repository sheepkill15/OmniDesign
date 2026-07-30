import { z } from 'zod'

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

export const providerStatusSchema = z.object({
  id: z.enum(['codex', 'claude']),
  name: z.string().min(1).max(200),
  installed: z.boolean(),
  authenticated: z.boolean(),
  detail: z.string().max(2_000),
  models: z.array(z.object({
    id: z.string().min(1).max(500),
    name: z.string().min(1).max(500),
    effortLevels: z.array(z.object({
      id: z.string().min(1).max(100),
      name: z.string().min(1).max(100),
      isDefault: z.boolean(),
    })).max(20),
  })).max(200),
}) satisfies z.ZodType<ProviderStatus>

export const providerStatusesSchema = z.array(providerStatusSchema).max(20)

export interface ProviderPrompt {
  readonly requestId: string
  readonly providerId: ProviderId
  readonly modelId: string
  readonly effort?: string
  readonly prompt: string
  readonly referencePaths?: readonly string[]
  readonly resumeSessionId?: string
  readonly signal?: AbortSignal
}

export interface ProviderReply {
  readonly providerId: ProviderId
  readonly modelId: string
  readonly text: string
  readonly sessionId?: string
}

export type ProviderActivityKind = 'status' | 'text' | 'tool' | 'result' | 'diagnostic'

export interface ProviderActivity {
  readonly requestId: string
  readonly providerId: ProviderId
  readonly kind: ProviderActivityKind
  readonly label: string
  readonly detail?: string
  readonly sessionId?: string
}
