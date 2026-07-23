import path from 'node:path'
import { z } from 'zod'
import type { Attachment, Message } from '../workspace/contracts.js'

const RECAP_MAX_MESSAGES = 16
const RECAP_MAX_CHARS = 4000

// Build a compact recap of the prior conversation for a FRESH provider session (used when we cannot
// resume the provider's own thread — a different provider, no session yet, or after a restart). It
// keeps the most recent user/assistant turns within a size budget so a new agent has continuity
// without an extra summarization call. Returns '' when there is nothing worth recapping.
export function buildConversationRecap(messages: readonly Pick<Message, 'role' | 'text'>[]): string {
  const turns = messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text.trim())
    .slice(-RECAP_MAX_MESSAGES)
    .map((message) => `${message.role === 'user' ? 'User' : 'OmniDesign'}: ${message.text.trim()}`)
  if (!turns.length) return ''
  // Trim from the oldest end until within the character budget, keeping recent turns whole.
  while (turns.length > 1 && turns.join('\n').length > RECAP_MAX_CHARS) turns.shift()
  return turns.join('\n')
}

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

export function createDesignAgentInstructions(workspacePath: string, attachments: readonly Attachment[] = [], sourceProjectPath: string | null = null, conversationRecap = ''): string {
  if (!path.isAbsolute(workspacePath)) throw new Error('The design workspace path must be absolute.')
  return [
    'You are OmniDesign’s design agent.',
    ...(conversationRecap ? [`This continues an existing conversation. For context only (the design files at ${workspacePath} already reflect the latest state), here is the conversation so far:`, conversationRecap, '---'] : []),
    `Work directly in the prepared Git repository at ${workspacePath}. OmniDesign has already initialised it and committed a starter index.html.`,
    'Architecture you must follow:',
    '- The design can be one page or several. Every *.html file you commit outside the .build/ folder is a page — at the repository root or in subfolders (e.g. about.html, pages/pricing.html). OmniDesign discovers the pages from Git; you never declare a file list or choose an entry point.',
    '- index.html is the home page when it exists; otherwise the first page is used. Build a single-page design in index.html unless the request clearly calls for multiple pages.',
    '- Link between pages with ordinary relative anchors, e.g. <a href="about.html">. Relative links resolve inside the preview and the exported design.',
    '- All committed files are included in both the preview and the exported design: every page plus any assets, fonts, and per-page JavaScript you author. You may split shared or page-specific JavaScript into sibling files and reference local images/fonts by relative path.',
    '- External resources over HTTPS are also allowed and will load in the preview: web fonts, third-party stylesheets, plugin/library scripts (e.g. from a CDN), and images.',
    '- Programmatic network requests are blocked: fetch, XMLHttpRequest, WebSocket, and EventSource will fail in the preview. Build a self-contained design that does not depend on calling a network API at runtime; use static or inline data instead.',
    '- Never reference the local filesystem or use file: URLs. The preview is sandboxed and cannot read local files, and such references are rejected during validation.',
    '- OmniDesign generates the .build/ folder: one shared compiled Tailwind stylesheet (.build/tailwind.css) covering every page, and the Alpine.js runtime (.build/alpine.js). Every page must link both in its <head> exactly as the starter index.html does (<link rel="stylesheet" href=".build/tailwind.css"> and <script defer src=".build/alpine.js">); adjust the relative prefix for pages in subfolders. Do NOT read, edit, create, or delete anything under .build/ — it is regenerated on every revision.',
    '- Tailwind CSS is compiled locally from the class names across all of your pages and scripts, including those written as string literals inside Alpine :class / x-bind:class bindings and x-transition attributes. Use Tailwind utility classes directly (static or Alpine-bound); do NOT add a Tailwind CDN or your own build step. Only class names that appear literally in the source are compiled, so do not assemble class names from fragments at runtime.',
    '- Use Alpine.js v3 directives (x-data, x-show, x-on/@click, x-text, etc.) directly; the runtime is already provided via .build/alpine.js.',
    '- The Alpine "collapse" plugin is bundled, so you can use x-collapse (and x-collapse.duration.NNNms / x-collapse.min.NNpx) for smooth expand/collapse; no plugin script or setup is needed.',
    '- Every page must be a complete HTML document with <html> and <body> elements.',
    '- Well-structured, responsive, accessible HTML is welcome, but it is not enforced — only genuine errors (a document that fails to compile or a broken/unsafe page) are rejected, so do not spend extra turns satisfying accessibility or best-practice checklists.',
    'Do not claim which files changed or whether a revision was created; OmniDesign determines that from Git and validation.',
    ...(sourceProjectPath ? [`A linked source project is available for READ-ONLY reference at ${sourceProjectPath}. Inspect its relevant source, styles, assets, and configuration before implementing the design so the result adopts its existing design language. Never edit, delete, rename, or create files there.`] : []),
    ...(attachments.length ? ['User-provided references are READ-ONLY. Use them only when relevant; never modify, delete, rename, or copy them into the design repository:', ...attachments.map((attachment) => `- ${attachment.path}${attachment.status === 'available' ? '' : ` (${attachment.status}; ask the user before relying on it)`}`)] : []),
    'Any explanatory text you write while working is already shown to the user in the conversation as you go. When you finish, respond only with a JSON object matching the required schema; its response value is a brief closing reply (e.g. a one-line confirmation) — do NOT restate the explanation you already gave, or it will appear twice.',
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
  // Return the LAST well-formed {response} object. Earlier messages an agent emits mid-turn are pushed
  // into the conversation live as they stream (see the design-agent runner), so here we only need the
  // final message. A single buffered chunk usually holds exactly one object.
  const objects = extractJsonObjects(text)
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const payload = tryParsePayload(objects[index])
    if (payload) return payload
  }

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
