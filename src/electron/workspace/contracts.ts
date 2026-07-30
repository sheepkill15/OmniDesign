import { z } from 'zod'

export const revisionSchema = z.object({
  id: z.string().min(1),
  parentRevisionId: z.string().nullable(),
  prompt: z.string(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  gitCommit: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  definitionVersion: z.number().int().positive().nullable().optional(),
  qualityCheckedAt: z.string().datetime().nullable().optional(),
  qualityCheckVersion: z.number().int().positive().nullable().optional(),
  createdAt: z.string().datetime(),
  thumbnailDataUrl: z.string().nullable(),
})

export const previewDiagnosticSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['console', 'runtime', 'load', 'quality']),
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

export const previewViewModeSchema = z.enum(['canvas', 'focused'])
export const previewFitSchema = z.enum(['artboard', 'fixed'])
export const previewDeviceSchema = z.enum(['phone', 'tablet', 'desktop', 'custom'])

// Preview view mode, device size, and fit are global preview settings honored by both the canvas and
// focused modes and persisted per design alongside the pane layout. New fields carry defaults so a
// layout row saved before Phase 2 still parses.
export const layoutSchema = z.object({
  conversationWidth: z.number().min(35).max(65),
  mode: layoutModeSchema.default('split'),
  previewViewMode: previewViewModeSchema.default('focused'),
  previewFit: previewFitSchema.default('artboard'),
  previewDevice: previewDeviceSchema.default('desktop'),
  previewCustomWidth: z.number().int().min(240).max(3840).default(1280),
  previewCustomHeight: z.number().int().min(320).max(4320).default(800),
  previewPage: z.string().min(1).nullable().default(null),
})

export const designPageSchema = z.object({
  path: z.string().min(1).max(1_000),
  title: z.string().max(200).nullable(),
  order: z.number().int().nonnegative(),
  isHome: z.boolean(),
})

export const revisionPagesSchema = z.object({
  pages: z.array(designPageSchema),
  entryPagePath: z.string().min(1).nullable(),
})

// A curated set of muted tag colors that harmonize with the brand palette. The trusted UI maps each
// to semantic surface/text tokens; tags always pair the color with their label, never hue alone.
export const tagColorSchema = z.enum(['neutral', 'mauve', 'sand', 'olive', 'lavender', 'blue', 'rose', 'amber'])

export const tagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  color: tagColorSchema,
  createdAt: z.string().datetime(),
})

export const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  parentFolderId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const projectKindSchema = z.enum(['standalone', 'linked'])

const definitionNameSchema = z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use lowercase semantic names separated by hyphens.')
const definitionDescriptionSchema = z.string().trim().max(500).nullable().default(null)

export function isSafeCssDefinitionValue(value: string): boolean {
  const input = value.trim()
  if (!input || /[;{}\u0000-\u001f\u007f]/.test(input) || /\/\*|\*\/|!\s*important/i.test(input)) return false
  const stack: string[] = []
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const character of input) {
    if (escaped) { escaped = false; continue }
    if (character === '\\') { escaped = true; continue }
    if (quote) { if (character === quote) quote = null; continue }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === '(' || character === '[') stack.push(character)
    else if (character === ')' || character === ']') {
      const expected = character === ')' ? '(' : '['
      if (stack.pop() !== expected) return false
    }
  }
  return !quote && !escaped && stack.length === 0
}

const cssDefinitionValueSchema = (maximum: number) => z.string().trim().min(1).max(maximum)
  .refine(isSafeCssDefinitionValue, 'Enter one CSS-compatible value without semicolons, braces, comments, control characters, or !important.')

function uniqueDefinitionNames<T extends { readonly name: string }>(items: readonly T[], context: z.RefinementCtx): void {
  const names = new Set<string>()
  items.forEach((item, index) => {
    if (names.has(item.name)) context.addIssue({ code: 'custom', path: [index, 'name'], message: `Duplicate definition name: ${item.name}` })
    names.add(item.name)
  })
}

const namedDefinitionValueSchema = z.object({
  name: definitionNameSchema,
  value: cssDefinitionValueSchema(500),
  description: definitionDescriptionSchema,
})

const namedDefinitionValuesSchema = z.array(namedDefinitionValueSchema).max(100).superRefine(uniqueDefinitionNames)

export const typographyDefinitionSchema = z.object({
  name: definitionNameSchema,
  fontFamily: cssDefinitionValueSchema(500),
  fontSize: cssDefinitionValueSchema(100),
  fontWeight: cssDefinitionValueSchema(100),
  lineHeight: cssDefinitionValueSchema(100),
  letterSpacing: cssDefinitionValueSchema(100).nullable().default(null),
  description: definitionDescriptionSchema,
})

export const projectDesignDefinitionsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  colors: namedDefinitionValuesSchema.default([]),
  typography: z.array(typographyDefinitionSchema).max(100).superRefine(uniqueDefinitionNames).default([]),
  spacing: namedDefinitionValuesSchema.default([]),
  shape: namedDefinitionValuesSchema.default([]),
  visualGuidance: z.string().trim().max(20_000).default(''),
  aiAgentInstructions: z.string().trim().max(50_000).default(''),
})

export const projectDesignDefinitionVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  definitions: projectDesignDefinitionsSchema,
  createdAt: z.string().datetime(),
})

export const projectDesignDefinitionStateSchema = z.object({
  current: projectDesignDefinitionVersionSchema.nullable(),
  promptSuppressed: z.boolean(),
})

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

const repositoryRelativeHtmlPathSchema = z.string().min(1).max(2_000).refine((value) => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && /\.html?$/i.test(value), 'Use a repository-relative HTML path.')

export const focusedTargetSchema = z.object({
  designId: z.string().min(1).max(100),
  revisionId: z.string().min(1).max(100),
  locationId: z.string().uuid().nullable().optional(),
  path: repositoryRelativeHtmlPathSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  label: z.string().min(1).max(200),
  stableId: z.string().max(500).nullable(),
  excerpt: z.string().min(1).max(4_100),
  dynamicDescription: z.string().max(500).nullable(),
}).refine((value) => value.endLine >= value.startLine, { message: 'Focused target line range is invalid.' })

export const focusedFeedbackSchema = z.object({
  id: z.string().uuid(),
  comment: z.string().trim().min(1).max(100_000),
  target: focusedTargetSchema,
  createdAt: z.string().datetime(),
})

export const resolveFocusedTargetRequestSchema = z.object({
  designId: z.string().min(1).max(100),
  revisionId: z.string().min(1).max(100),
  token: z.string().uuid(),
  page: repositoryRelativeHtmlPathSchema,
  locationId: z.string().uuid(),
  clickedLabel: z.string().trim().min(1).max(200),
  usedAncestor: z.boolean(),
})

export const locateFocusedTargetsRequestSchema = z.object({
  designId: z.string().min(1).max(100),
  revisionId: z.string().min(1).max(100),
  token: z.string().uuid(),
  targets: z.array(z.object({
    id: z.string().min(1).max(100),
    target: focusedTargetSchema,
  })).max(200),
})

export const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  focusedTarget: focusedTargetSchema.nullable().default(null),
  focusedFeedback: z.array(focusedFeedbackSchema).max(50).optional(),
  createdAt: z.string().datetime(),
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
  lastProviderId: z.string().nullable(),
  folderId: z.string().nullable(),
  tags: z.array(tagSchema).default([]),
  currentDefinitionVersion: z.number().int().positive().nullable().default(null),
  definitionPromptSuppressed: z.boolean().default(false),
})

export const projectIdRequestSchema = z.object({
  projectId: z.string().min(1).max(100),
})

export const saveProjectDesignDefinitionsRequestSchema = projectIdRequestSchema.extend({
  definitions: projectDesignDefinitionsSchema,
})

export const proposeProjectDesignDefinitionsRequestSchema = projectIdRequestSchema.extend({
  providerId: z.enum(['mock', 'codex', 'claude']),
  modelId: z.string().trim().min(1).max(200),
  effort: z.string().trim().min(1).max(100).nullable().optional(),
})

export const setProjectDefinitionPromptSuppressedRequestSchema = projectIdRequestSchema.extend({
  suppressed: z.boolean(),
})

export const projectDefinitionDecisionRequestSchema = z.object({
  designId: z.string().min(1).max(100),
  targetVersion: z.number().int().positive(),
  providerId: z.enum(['codex', 'claude']).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  effort: z.string().trim().min(1).max(100).nullable().optional(),
}).refine((value) => Boolean(value.providerId) === Boolean(value.modelId), { message: 'Provider and model must be supplied together.' })

export const applyProjectDefinitionsToAllRequestSchema = projectIdRequestSchema.extend({
  targetVersion: z.number().int().positive(),
})

export const renameProjectRequestSchema = projectIdRequestSchema.extend({
  name: z.string().trim().min(1).max(200),
})

export const associateDesignRequestSchema = z.object({
  designId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100),
})

export const reconnectProjectRequestSchema = projectIdRequestSchema.extend({
  sourceProjectPath: z.string().min(1).max(32_000),
})

export const cloneProjectRequestSchema = z.object({
  remoteUrl: z.string().trim().min(1).max(8_000),
  destinationPath: z.string().trim().min(1).max(32_000),
})

export const registerLinkedProjectRequestSchema = z.object({
  sourceProjectPath: z.string().trim().min(1).max(32_000),
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

// The id of the design open in the workspace when the app last closed, or null when nothing was open.
export const lastOpenDesignSchema = z.string().min(1).max(100).nullable()

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
  providerSessionId: z.string().min(1).nullable().default(null),
  definitionTargetVersion: z.number().int().positive().nullable().default(null),
  focusedTarget: focusedTargetSchema.nullable().default(null),
  focusedFeedback: z.array(focusedFeedbackSchema).max(50).optional(),
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
  definitionVersion: z.number().int().positive().nullable().optional(),
  pendingDefinitionVersion: z.number().int().positive().nullable().optional(),
  keptDefinitionVersion: z.number().int().positive().nullable().optional(),
  definitionApplicationState: z.enum(['current', 'pending', 'applying', 'kept', 'failed', 'unavailable']).optional(),
  definitionApplicationError: z.string().nullable().optional(),
  draft: z.string(),
  draftAttachments: z.array(attachmentSchema),
  thumbnailDataUrl: z.string().nullable(),
  queuePaused: z.boolean(),
  titlePending: z.boolean().default(false),
  adaptationPending: z.boolean().default(false),
  entryPagePath: z.string().min(1).nullable().default(null),
  pages: z.array(designPageSchema).default([]),
  tags: z.array(tagSchema).default([]),
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
  cloneRemoteUrl: z.string().trim().min(1).max(32_000).nullable().optional(),
  cloneDestinationDirectory: z.string().min(1).max(32_000).nullable().optional(),
  attachments: z.array(attachmentSchema).max(100).default([]),
})

export const attachmentPickerRequestSchema = z.object({
  kind: z.enum(['files', 'folder']),
})

export const designIdRequestSchema = z.object({
  designId: z.string().min(1).max(100),
})

export const renameDesignRequestSchema = designIdRequestSchema.extend({
  title: z.string().trim().min(1).max(200),
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
  focusedTarget: focusedTargetSchema.nullable().optional(),
})

export const queueFocusedFeedbackRequestSchema = designIdRequestSchema.extend({
  comment: z.string().trim().min(1).max(100_000),
  target: focusedTargetSchema,
})

export const removeFocusedFeedbackRequestSchema = designIdRequestSchema.extend({
  feedbackId: z.string().uuid(),
})

export const submitFocusedFeedbackBatchRequestSchema = designIdRequestSchema.extend({
  feedbackIds: z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, 'Focused feedback identifiers must be unique.'),
  providerId: z.enum(['mock', 'codex', 'claude']).default('mock'),
  modelId: z.string().trim().min(1).max(200).default('mock-v1'),
  effort: z.string().trim().min(1).max(100).nullable().optional(),
})

export const selectRevisionRequestSchema = designIdRequestSchema.extend({
  revisionId: z.string().min(1).max(100),
})

export const compareRevisionsRequestSchema = designIdRequestSchema.extend({
  baseRevisionId: z.string().min(1).max(100),
  targetRevisionId: z.string().min(1).max(100),
})

export const revisionComparisonSchema = z.object({
  baseRevisionId: z.string().min(1),
  targetRevisionId: z.string().min(1),
  files: z.array(z.object({
    path: z.string().min(1),
    status: z.enum(['added', 'modified', 'removed']),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
  })),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
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
  page: z.string().min(1).max(1_000).optional(),
})

export const exportRequestSchema = selectRevisionRequestSchema

export const previewRegisterRequestSchema = selectRevisionRequestSchema

export const previewPopOutRequestSchema = selectRevisionRequestSchema.extend({
  page: z.string().min(1).max(1_000).optional(),
})

export const previewDiagnosticReportSchema = selectRevisionRequestSchema.extend({
  diagnostic: z.object({
    level: z.enum(['warning', 'error']),
    message: z.string().min(1).max(4_000),
    source: z.string().max(4_000).nullable().default(null),
    line: z.number().int().nullable().default(null),
  }),
})

// The thumbnail is rendered off-screen from the revision's entry page, so the request only needs to
// identify the revision — no on-screen rectangle.
export const previewCaptureRequestSchema = selectRevisionRequestSchema

export const revisionPagesRequestSchema = selectRevisionRequestSchema

export const setEntryPageRequestSchema = designIdRequestSchema.extend({
  entryPagePath: z.string().min(1).max(1_000).nullable(),
})

export const savePageMetadataRequestSchema = designIdRequestSchema.extend({
  path: z.string().min(1).max(1_000),
  title: z.string().trim().min(1).max(200).nullable(),
  order: z.number().int().nonnegative().default(0),
})

export const createFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentFolderId: z.string().min(1).max(100).nullable().optional(),
})

export const folderIdRequestSchema = z.object({
  folderId: z.string().min(1).max(100),
})

export const renameFolderRequestSchema = folderIdRequestSchema.extend({
  name: z.string().trim().min(1).max(120),
})

export const moveProjectToFolderRequestSchema = z.object({
  projectId: z.string().min(1).max(100),
  folderId: z.string().min(1).max(100).nullable(),
})

export const createTagRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: tagColorSchema.default('neutral'),
})

export const tagIdRequestSchema = z.object({
  tagId: z.string().min(1).max(100),
})

export const tagTargetRequestSchema = z.object({
  targetKind: z.enum(['project', 'design']),
  targetId: z.string().min(1).max(100),
  tagId: z.string().min(1).max(100),
})

export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type ProjectDesignDefinitions = z.infer<typeof projectDesignDefinitionsSchema>
export type ProjectDesignDefinitionVersion = z.infer<typeof projectDesignDefinitionVersionSchema>
export type ProjectDesignDefinitionState = z.infer<typeof projectDesignDefinitionStateSchema>
export type ProjectIdRequest = z.infer<typeof projectIdRequestSchema>
export type SaveProjectDesignDefinitionsRequest = z.infer<typeof saveProjectDesignDefinitionsRequestSchema>
export type RenameProjectRequest = z.infer<typeof renameProjectRequestSchema>
export type ReconnectProjectRequest = z.infer<typeof reconnectProjectRequestSchema>
export type CloneProjectRequest = z.infer<typeof cloneProjectRequestSchema>
export type RegisterLinkedProjectRequest = z.infer<typeof registerLinkedProjectRequestSchema>
export type TrashItem = z.infer<typeof trashItemSchema>
export type TrashItemRequest = z.infer<typeof trashItemRequestSchema>
export type Design = z.infer<typeof designSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type FocusedTarget = z.infer<typeof focusedTargetSchema>
export type FocusedFeedback = z.infer<typeof focusedFeedbackSchema>
export type Revision = z.infer<typeof revisionSchema> & { diagnostics: PreviewDiagnostic[] }
export type Message = z.infer<typeof messageSchema>
export type PreviewDiagnostic = z.infer<typeof previewDiagnosticSchema>
export type InvalidCandidate = z.infer<typeof invalidCandidateSchema>
export type CreateDesignRequest = z.infer<typeof createDesignRequestSchema>
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type QueueFocusedFeedbackRequest = z.infer<typeof queueFocusedFeedbackRequestSchema>
export type RemoveFocusedFeedbackRequest = z.infer<typeof removeFocusedFeedbackRequestSchema>
export type SubmitFocusedFeedbackBatchRequest = z.infer<typeof submitFocusedFeedbackBatchRequestSchema>
export type SelectRevisionRequest = z.infer<typeof selectRevisionRequestSchema>
export type CompareRevisionsRequest = z.infer<typeof compareRevisionsRequestSchema>
export type RevisionComparison = z.infer<typeof revisionComparisonSchema>
export type RenameDesignRequest = z.infer<typeof renameDesignRequestSchema>
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
export type DesignPage = z.infer<typeof designPageSchema>
export type RevisionPages = z.infer<typeof revisionPagesSchema>
export type Tag = z.infer<typeof tagSchema>
export type TagColor = z.infer<typeof tagColorSchema>
export type Folder = z.infer<typeof folderSchema>
export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>
export type RenameFolderRequest = z.infer<typeof renameFolderRequestSchema>
export type MoveProjectToFolderRequest = z.infer<typeof moveProjectToFolderRequestSchema>
export type CreateTagRequest = z.infer<typeof createTagRequestSchema>
export type TagTargetRequest = z.infer<typeof tagTargetRequestSchema>
export type RevisionPagesRequest = z.infer<typeof revisionPagesRequestSchema>
export type SetEntryPageRequest = z.infer<typeof setEntryPageRequestSchema>
export type SavePageMetadataRequest = z.infer<typeof savePageMetadataRequestSchema>

export interface GenerationActivity {
  readonly designId: string
  readonly stage: 'queued' | 'generating' | 'compiling' | 'validating' | 'repairing' | 'saving' | 'complete' | 'failed' | 'cancelled' | 'interrupted'
  readonly detail: string
}

const generationStageLabels: Record<GenerationActivity['stage'], string> = {
  queued: 'Queued',
  generating: 'Designing',
  compiling: 'Preparing styles',
  validating: 'Checking the design',
  repairing: 'Making improvements',
  saving: 'Saving',
  complete: 'Design ready',
  failed: 'Didn’t finish',
  cancelled: 'Stopped',
  interrupted: 'Interrupted',
}

export function generationStageLabel(stage: string): string {
  return generationStageLabels[stage as GenerationActivity['stage']] ?? stage
}
