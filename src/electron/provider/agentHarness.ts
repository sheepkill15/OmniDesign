import path from 'node:path'
import { z } from 'zod'

const MAX_RESPONSE_LENGTH = 100_000

// Kept lenient on purpose: models routinely add extra keys, so we only require a usable `response`
// string and ignore anything else rather than rejecting an otherwise-good completion.
export const agentCompletionPayloadSchema = z.object({
  response: z.string().trim().min(1).max(MAX_RESPONSE_LENGTH),
}).passthrough()

export interface AgentCompletionPayload {
  readonly response: string
}

export const agentCompletionOutputSchema = {
  type: 'object',
  properties: {
    response: { type: 'string', minLength: 1, maxLength: 100_000 },
  },
  required: ['response'],
  additionalProperties: false,
} as const

export function createDesignAgentInstructions(workspacePath: string): string {
  if (!path.isAbsolute(workspacePath)) throw new Error('The design workspace path must be absolute.')
  return [
    'You are OmniDesign’s design agent.',
    `Work directly in the prepared Git repository at ${workspacePath}. OmniDesign has already initialised it and committed a starter index.html.`,
    'Architecture you must follow:',
    '- index.html at the repository root IS the design. It is the only file OmniDesign previews and exports, so the finished result must render completely from index.html on its own.',
    '- Keep the design self-contained in index.html. Inline your CSS and JavaScript instead of splitting them into sibling files (styles.css, app.js, local images); sibling files are committed to Git but are NOT included in the preview or the exported design.',
    '- External resources over HTTPS are allowed and will load in the preview: web fonts, third-party stylesheets, plugin/library scripts (e.g. from a CDN), and images. Prefer HTTPS URLs when you need an asset you would otherwise keep in a local file.',
    '- Never reference the local filesystem or use file: URLs. The preview is sandboxed and cannot read local files, and such references are rejected during validation.',
    '- Tailwind CSS is compiled locally by OmniDesign from the class names in index.html, including those written as string literals inside Alpine :class / x-bind:class bindings and x-transition attributes. Use Tailwind utility classes directly (static or Alpine-bound); do NOT add a Tailwind CDN, <link>, or build step. Only class names that appear literally in the markup are compiled, so do not assemble class names from fragments at runtime.',
    '- Alpine.js v3 is provided locally: OmniDesign injects the Alpine runtime automatically whenever the markup uses Alpine, so use its directives (x-data, x-show, x-on/@click, x-text, etc.) directly and do NOT add an Alpine <script> tag or CDN link yourself.',
    '- index.html must remain a complete HTML document with <html> and <body> elements.',
    'Do not claim which files changed or whether a revision was created; OmniDesign determines that from Git and validation.',
    'When you finish, respond only with a JSON object matching the required schema. Its response value is your concise conversational reply to the user.',
  ].join('\n')
}

/**
 * Extract the agent's conversational reply from its final message. Models are inconsistent about
 * output formatting — they wrap JSON in Markdown fences, prepend prose, or add extra keys — and the
 * actual design work lives in the Git working tree regardless. So we try increasingly forgiving
 * strategies and, as a last resort, treat the whole text as the reply rather than discarding a valid
 * revision over a formatting quirk.
 */
export function parseAgentCompletionPayload(value: string): AgentCompletionPayload {
  const text = value.trim()
  for (const candidate of jsonCandidates(text)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    const result = agentCompletionPayloadSchema.safeParse(parsed)
    if (result.success) return { response: result.data.response.slice(0, MAX_RESPONSE_LENGTH) }
  }

  const fallback = stripCodeFences(text).trim()
  if (fallback) return { response: fallback.slice(0, MAX_RESPONSE_LENGTH) }
  throw new Error('The agent did not return any completion text.')
}

function jsonCandidates(text: string): string[] {
  const candidates = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced) candidates.push(fenced)
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1))
  return candidates
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:[a-z]*)?\s*([\s\S]*?)```/i)?.[1]
  return (fenced ?? text).trim()
}
