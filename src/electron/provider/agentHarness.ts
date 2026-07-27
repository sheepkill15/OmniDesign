import path from 'node:path'
import type { Attachment, FocusedTarget, Message } from '../workspace/contracts.js'
import { PREVIEW_ALLOWED_HOSTS } from '../workspace/previewPolicy.js'

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

export function createFocusedEditPrompt(prompt: string, target: FocusedTarget): string {
  return [
    prompt,
    '',
    'Focused edit target:',
    `- Source: ${target.path}:${target.startLine}-${target.endLine}`,
    `- Element: ${target.label}${target.stableId ? ` (stable identifier: ${target.stableId})` : ''}`,
    ...(target.dynamicDescription ? [`- The clicked runtime element was ${target.dynamicDescription}; the source location above is its nearest authored ancestor.`] : []),
    '- Keep the requested outcome focused on this element. You may update supporting CSS, JavaScript, shared components, or adjacent markup when necessary.',
    '- Source excerpt:',
    '```html',
    target.excerpt,
    '```',
  ].join('\n')
}

const MAX_RESPONSE_LENGTH = 100_000

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
    '- All committed files are included in both the preview and the exported design: every page plus any assets, fonts, and per-page JavaScript you author. Prefer local assets committed alongside your pages — reference images, fonts, and per-page/shared JavaScript by relative path, and split shared or page-specific JavaScript into sibling files.',
    `- External resources (web fonts, third-party stylesheets, plugin/library scripts, and images) load in the preview ONLY over HTTPS and ONLY from these approved hosts: ${PREVIEW_ALLOWED_HOSTS.join(', ')}. A resource from any other host is blocked, so prefer a local asset or one of these hosts; do not reference other domains.`,
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
    'Everything you write is shown directly to the person you are designing for, who may not be technical. Talk about the design the way a designer would to a client: what it looks like, what changed, how it will feel to use. Use plain, everyday language and keep it short. Do NOT mention code, file names, HTML, CSS, frameworks, Git, commits, tools, or any other technical detail, and do NOT walk through how you built it.',
    'The notes you write while working appear in the conversation as you go, so the user can follow along. When you finish, just end with a brief, friendly closing message. There is no required format — write plain text or Markdown, not JSON or any wrapper — and do not repeat what you already said, or it will appear twice.',
  ].join('\n')
}

/**
 * We no longer impose any output shape on the design agent: whatever it says is treated as Markdown
 * meant for the user, and the actual design work lives in the Git working tree regardless. This just
 * trims surrounding whitespace and caps the length so a runaway response cannot balloon the store.
 */
export function normalizeAgentReply(value: string): string {
  return value.trim().slice(0, MAX_RESPONSE_LENGTH)
}
