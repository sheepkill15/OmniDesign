import path from 'node:path'
import { z } from 'zod'
import type { Attachment } from '../workspace/contracts.js'

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

export function createDesignAgentInstructions(workspacePath: string, attachments: readonly Attachment[] = [], sourceProjectPath: string | null = null): string {
  if (!path.isAbsolute(workspacePath)) throw new Error('The design workspace path must be absolute.')
  return [
    'You are OmniDesign’s design agent.',
    `Work directly in the prepared Git repository at ${workspacePath}. OmniDesign has already initialised it and committed a starter index.html.`,
    'Architecture you must follow:',
    '- index.html at the repository root IS the design. It is the only file OmniDesign previews and exports, so the finished result must render completely from index.html on its own.',
    '- Keep the design self-contained in index.html. Inline your CSS and JavaScript instead of splitting them into sibling files (styles.css, app.js, local images); sibling files are committed to Git but are NOT included in the preview or the exported design.',
    '- External resources over HTTPS are allowed and will load in the preview: web fonts, third-party stylesheets, plugin/library scripts (e.g. from a CDN), and images. Prefer HTTPS URLs when you need an asset you would otherwise keep in a local file.',
    '- Programmatic network requests are blocked: fetch, XMLHttpRequest, WebSocket, and EventSource will fail in the preview. Build a self-contained design that does not depend on calling a network API at runtime; use static or inline data instead.',
    '- Never reference the local filesystem or use file: URLs. The preview is sandboxed and cannot read local files, and such references are rejected during validation.',
    '- OmniDesign generates a .build/ folder containing the compiled Tailwind CSS (.build/tailwind.css) and the Alpine.js runtime (.build/alpine.js). The starter index.html already links both in <head>. Keep those <link>/<script> tags, and do NOT read, edit, create, or delete anything under .build/ — it is regenerated on every revision.',
    '- Tailwind CSS is compiled locally from the class names in index.html, including those written as string literals inside Alpine :class / x-bind:class bindings and x-transition attributes. Use Tailwind utility classes directly (static or Alpine-bound); do NOT add a Tailwind CDN or your own build step. Only class names that appear literally in the markup are compiled, so do not assemble class names from fragments at runtime.',
    '- Use Alpine.js v3 directives (x-data, x-show, x-on/@click, x-text, etc.) directly; the runtime is already provided via .build/alpine.js.',
    '- index.html must remain a complete HTML document with <html> and <body> elements.',
    '- Meet the baseline document-quality contract: set the html lang attribute, include a responsive viewport meta tag, use exactly one <main> landmark and one <h1>, give every interactive control an accessible name, and avoid horizontal overflow at phone and desktop widths.',
    'Do not claim which files changed or whether a revision was created; OmniDesign determines that from Git and validation.',
    ...(sourceProjectPath ? [`A linked source project is available for READ-ONLY reference at ${sourceProjectPath}. Inspect its relevant source, styles, assets, and configuration before implementing the design so the result adopts its existing design language. Never edit, delete, rename, or create files there.`] : []),
    ...(attachments.length ? ['User-provided references are READ-ONLY. Use them only when relevant; never modify, delete, rename, or copy them into the design repository:', ...attachments.map((attachment) => `- ${attachment.path}${attachment.status === 'available' ? '' : ` (${attachment.status}; ask the user before relying on it)`}`)] : []),
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
  const text = stripCodeFences(value.trim())
  // An agent can emit several {response} objects across one turn (a message, then a follow-up that
  // continues from it, then a final summary), and they arrive concatenated. Keep ALL of them, in order,
  // joined into the reply — dropping all but the last left the saved message reading as a fragment of
  // content no longer in the history. Consecutive duplicates are collapsed.
  const objects = extractJsonObjects(text)
  const responses: string[] = []
  for (const object of objects) {
    const payload = tryParsePayload(object)
    if (payload && payload.response !== responses.at(-1)) responses.push(payload.response)
  }
  if (responses.length) return { response: responses.join('\n\n').slice(0, MAX_RESPONSE_LENGTH) }

  // Fall back to parsing the whole text, then to the raw text so a valid revision is never discarded
  // over a formatting quirk.
  const whole = tryParsePayload(text)
  if (whole) return whole
  if (text) return { response: text.slice(0, MAX_RESPONSE_LENGTH) }
  throw new Error('The agent did not return any completion text.')
}

function tryParsePayload(candidate: string): AgentCompletionPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  const result = agentCompletionPayloadSchema.safeParse(parsed)
  return result.success ? { response: result.data.response.slice(0, MAX_RESPONSE_LENGTH) } : null
}

// Find each balanced top-level {...} object in the text, ignoring braces inside string literals so
// concatenated JSON messages are separated correctly.
function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return objects
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:[a-z]*)?\s*([\s\S]*?)```/i)?.[1]
  return (fenced ?? text).trim()
}
