import { z } from 'zod'

export const revisionSchema = z.object({
  id: z.string().min(1),
  parentRevisionId: z.string().nullable(),
  prompt: z.string(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  gitCommit: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  createdAt: z.string().datetime(),
  thumbnailDataUrl: z.string().nullable(),
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

export const invalidCandidateSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  html: z.string(),
  diagnostic: z.string().min(1),
  createdAt: z.string().datetime(),
})

export const layoutModeSchema = z.enum(['split', 'conversation', 'preview', 'popped'])

export const layoutSchema = z.object({
  conversationWidth: z.number().min(35).max(65),
  mode: layoutModeSchema.default('split'),
})

export const projectKindSchema = z.enum(['standalone', 'linked'])

export const attachmentSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1).max(32_000),
  name: z.string().min(1).max(1_000),
  kind: z.enum(['file', 'folder']),
  size: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().datetime().nullable(),
  selectedAt: z.string().datetime(),
  status: z.enum(['available', 'changed', 'missing']),
})

export const projectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: projectKindSchema,
  sourceProjectPath: z.string().nullable(),
  sourceAvailable: z.boolean(),
  designCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  thumbnailDataUrl: z.string().nullable(),
  latestDesignTitle: z.string().nullable(),
  latestPrompt: z.string().nullable(),
})

export const projectIdRequestSchema = z.object({
  projectId: z.string().min(1).max(100),
})

export const reconnectProjectRequestSchema = projectIdRequestSchema.extend({
  sourceProjectPath: z.string().min(1).max(32_000),
})

export const cloneProjectRequestSchema = z.object({
  remoteUrl: z.string().trim().min(1).max(8_000),
  destinationPath: z.string().trim().min(1).max(32_000),
})

export const trashItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['project', 'design']),
  name: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  projectName: z.string().min(1).nullable(),
  sourceProjectPath: z.string().nullable(),
  trashedAt: z.string().datetime(),
  purgeAt: z.string().datetime(),
})

export const trashItemRequestSchema = z.object({
  kind: z.enum(['project', 'design']),
  id: z.string().min(1).max(100),
})

export const themeSchema = z.enum(['dark', 'light'])

export const generationSelectionSchema = z.object({
  providerId: z.enum(['mock', 'codex', 'claude']).catch('mock'),
  modelId: z.string().trim().min(1).max(200).catch('mock-v1'),
  effort: z.string().trim().min(1).max(100).nullable().catch(null),
})

export const generationStepSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const generationJobStateSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
export const generationJobModeSchema = z.enum(['fresh', 'continue'])

export const generationJobSchema = z.object({
  id: z.string().min(1),
  designId: z.string().min(1),
  prompt: z.string(),
  providerId: z.enum(['mock', 'codex', 'claude']),
  modelId: z.string().min(1),
  effort: z.string().min(1).nullable().optional(),
  attachments: z.array(attachmentSchema).default([]),
  mode: generationJobModeSchema.default('fresh'),
  state: generationJobStateSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
})

export const designSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  sourceProjectPath: z.string().nullable(),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeRevisionId: z.string().nullable(),
  selectedRevisionId: z.string().nullable(),
  draft: z.string(),
  draftAttachments: z.array(attachmentSchema),
  thumbnailDataUrl: z.string().nullable(),
  queuePaused: z.boolean(),
  lastSelection: generationSelectionSchema,
  generationSteps: z.array(generationStepSchema),
  layout: layoutSchema,
  messages: z.array(messageSchema),
  invalidCandidates: z.array(invalidCandidateSchema),
  generationJobs: z.array(generationJobSchema),
  revisions: z.array(revisionSchema.extend({ diagnostics: z.array(previewDiagnosticSchema) })),
})

export const createDesignRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  providerId: z.enum(['mock', 'codex', 'claude']).default('mock'),
  modelId: z.string().trim().min(1).max(200).default('mock-v1'),
  effort: z.string().trim().min(1).max(100).nullable().optional(),
  sourceProjectPath: z.string().min(1).max(32_000).nullable().optional(),
  projectId: z.string().min(1).max(100).nullable().optional(),
  attachments: z.array(attachmentSchema).max(100).default([]),
})

export const designIdRequestSchema = z.object({
  designId: z.string().min(1).max(100),
})

export const generationJobIdRequestSchema = z.object({
  jobId: z.string().uuid(),
})

export const generateRequestSchema = designIdRequestSchema.extend({
  prompt: z.string().trim().min(1).max(100_000),
  providerId: z.enum(['mock', 'codex', 'claude']).default('mock'),
  modelId: z.string().trim().min(1).max(200).default('mock-v1'),
  effort: z.string().trim().min(1).max(100).nullable().optional(),
  attachments: z.array(attachmentSchema).max(100).default([]),
})

export const selectRevisionRequestSchema = designIdRequestSchema.extend({
  revisionId: z.string().min(1).max(100),
})

export const saveDraftRequestSchema = designIdRequestSchema.extend({
  draft: z.string().max(100_000),
  attachments: z.array(attachmentSchema).max(100).default([]),
})

export const saveLayoutRequestSchema = designIdRequestSchema.extend({
  layout: layoutSchema,
})

export const saveDesignSelectionRequestSchema = designIdRequestSchema.extend({
  selection: generationSelectionSchema,
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

export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type ProjectIdRequest = z.infer<typeof projectIdRequestSchema>
export type ReconnectProjectRequest = z.infer<typeof reconnectProjectRequestSchema>
export type CloneProjectRequest = z.infer<typeof cloneProjectRequestSchema>
export type TrashItem = z.infer<typeof trashItemSchema>
export type TrashItemRequest = z.infer<typeof trashItemRequestSchema>
export type Design = z.infer<typeof designSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type Revision = z.infer<typeof revisionSchema> & { diagnostics: PreviewDiagnostic[] }
export type Message = z.infer<typeof messageSchema>
export type PreviewDiagnostic = z.infer<typeof previewDiagnosticSchema>
export type InvalidCandidate = z.infer<typeof invalidCandidateSchema>
export type CreateDesignRequest = z.infer<typeof createDesignRequestSchema>
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type SelectRevisionRequest = z.infer<typeof selectRevisionRequestSchema>
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>
export type Layout = z.infer<typeof layoutSchema>
export type LayoutMode = z.infer<typeof layoutModeSchema>
export type SaveLayoutRequest = z.infer<typeof saveLayoutRequestSchema>
export type Theme = z.infer<typeof themeSchema>
export type GenerationJob = z.infer<typeof generationJobSchema>
export type GenerationJobState = z.infer<typeof generationJobStateSchema>
export type GenerationSelection = z.infer<typeof generationSelectionSchema>
export type GenerationStep = z.infer<typeof generationStepSchema>
export type SaveDesignSelectionRequest = z.infer<typeof saveDesignSelectionRequestSchema>
export type PreviewRequest = z.infer<typeof previewRequestSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>

export interface GenerationActivity {
  readonly designId: string
  readonly stage: 'queued' | 'generating' | 'compiling' | 'validating' | 'repairing' | 'saving' | 'complete' | 'failed' | 'cancelled' | 'interrupted'
  readonly detail: string
}

const generationStageLabels: Record<GenerationActivity['stage'], string> = {
  queued: 'Queued',
  generating: 'Generating design',
  compiling: 'Compiling styles',
  validating: 'Validating output',
  repairing: 'Repairing candidate',
  saving: 'Saving revision',
  complete: 'Revision ready',
  failed: 'Generation failed',
  cancelled: 'Generation cancelled',
  interrupted: 'Generation interrupted',
}

export function generationStageLabel(stage: string): string {
  return generationStageLabels[stage as GenerationActivity['stage']] ?? stage
}
