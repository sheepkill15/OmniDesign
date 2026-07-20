import { z } from 'zod'

export const revisionSchema = z.object({
  id: z.string().min(1),
  parentRevisionId: z.string().nullable(),
  prompt: z.string(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  createdAt: z.string().datetime(),
  html: z.string(),
})

export const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  createdAt: z.string().datetime(),
})

export const previewDiagnosticSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['console', 'runtime', 'load']),
  level: z.enum(['warning', 'error']),
  message: z.string().min(1),
  source: z.string().nullable(),
  line: z.number().int().nullable(),
  createdAt: z.string().datetime(),
})

export const layoutSchema = z.object({
  conversationWidth: z.number().min(35).max(65),
})

export const designSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeRevisionId: z.string().nullable(),
  selectedRevisionId: z.string().nullable(),
  draft: z.string(),
  thumbnailDataUrl: z.string().nullable(),
  layout: layoutSchema,
  messages: z.array(messageSchema),
  revisions: z.array(revisionSchema.extend({ diagnostics: z.array(previewDiagnosticSchema) })),
})

export const createDesignRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
})

export const designIdRequestSchema = z.object({
  designId: z.string().min(1).max(100),
})

export const generateRequestSchema = designIdRequestSchema.extend({
  prompt: z.string().trim().min(1).max(100_000),
})

export const selectRevisionRequestSchema = designIdRequestSchema.extend({
  revisionId: z.string().min(1).max(100),
})

export const saveDraftRequestSchema = designIdRequestSchema.extend({
  draft: z.string().max(100_000),
})

export const saveLayoutRequestSchema = designIdRequestSchema.extend({
  layout: layoutSchema,
})

export const previewRequestSchema = selectRevisionRequestSchema.extend({
  bounds: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
})

export const exportRequestSchema = selectRevisionRequestSchema

export type Design = z.infer<typeof designSchema>
export type Revision = z.infer<typeof revisionSchema> & { diagnostics: PreviewDiagnostic[] }
export type Message = z.infer<typeof messageSchema>
export type PreviewDiagnostic = z.infer<typeof previewDiagnosticSchema>
export type CreateDesignRequest = z.infer<typeof createDesignRequestSchema>
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type SelectRevisionRequest = z.infer<typeof selectRevisionRequestSchema>
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>
export type Layout = z.infer<typeof layoutSchema>
export type SaveLayoutRequest = z.infer<typeof saveLayoutRequestSchema>
export type PreviewRequest = z.infer<typeof previewRequestSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>

export interface GenerationActivity {
  readonly designId: string
  readonly stage: 'generating' | 'compiling' | 'validating' | 'saving' | 'complete' | 'failed'
  readonly detail: string
}
