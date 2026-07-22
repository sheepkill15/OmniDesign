import type { Attachment } from './contracts.js'
import type { ProviderStatus } from '../provider/types.js'

const MAX_TITLE_LENGTH = 80
const LIGHTWEIGHT_MODEL_PATTERN = /(?:nano|mini|small|fast|haiku|instant|lite|spark)/i
const LOWEST_EFFORT_PATTERN = /^(?:minimal|low|none)$/i

export function selectLightweightMetadataSelection(statuses: readonly ProviderStatus[], providerId: 'codex' | 'claude', fallback: { readonly modelId: string; readonly effort: string | null }): { readonly modelId: string; readonly effort?: string } {
  const provider = statuses.find((status) => status.id === providerId)
  const model = provider?.models.slice().sort((first, second) => Number(LIGHTWEIGHT_MODEL_PATTERN.test(second.id)) - Number(LIGHTWEIGHT_MODEL_PATTERN.test(first.id)))[0]
  if (!model) return { modelId: fallback.modelId }
  const effort = model.effortLevels.slice().sort((first, second) => Number(LOWEST_EFFORT_PATTERN.test(second.id)) - Number(LOWEST_EFFORT_PATTERN.test(first.id)))[0]
  return { modelId: model.id, ...(effort ? { effort: effort.id } : {}) }
}

export function createDesignTitlePrompt(prompt: string, attachments: readonly Attachment[]): string {
  const references = attachments.length
    ? `\nReferences: ${attachments.map((attachment) => `${attachment.kind}:${attachment.name}`).join(', ')}`
    : ''
  return `Return only a concise 2-6 word title for a new design. No punctuation, quotes, markdown, explanation, or file operations.\nRequest: ${prompt}${references}`
}

export function fallbackDesignTitle(prompt: string): string {
  const words = prompt.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).slice(0, 5)
  const title = words.join(' ')
  return title ? title[0].toUpperCase() + title.slice(1) : 'Untitled design'
}

export function normalizeDesignTitle(reply: string, fallback: string): string {
  const title = reply.replace(/[\r\n]+/g, ' ').replace(/^\s*(?:title\s*:\s*)?["'`]+|["'`]+\s*$/gi, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
  return title || fallback
}

export function shouldReplaceFallbackTitle(currentTitle: string, fallbackTitle: string, generatedTitle: string): boolean {
  return currentTitle === fallbackTitle && generatedTitle !== fallbackTitle
}
