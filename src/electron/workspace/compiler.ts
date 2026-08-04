import { compile } from '@tailwindcss/node'
import { discoverPages, isCandidateSource } from './pages.js'

// Plain `class="..."` — the leading lookbehind keeps this from also matching `:class`/`x-bind:class`,
// whose values are JS expressions rather than literal class lists (handled separately below).
const staticClassPattern = /(?<![-:\w])class\s*=\s*(["'])([^"']*)\1/gi
// Alpine dynamic class bindings: `:class="..."` and `x-bind:class="..."`. The value is a JS
// expression (object, array, ternary, template) whose class names live in its string literals.
const dynamicClassPattern = /(?::|x-bind:)class\s*=\s*(["'])([\s\S]*?)\1/gi
// Alpine transition attributes hold literal class lists: `x-transition:enter="ease-out duration-300"`.
const transitionClassPattern = /x-transition:[\w-]+\s*=\s*(["'])([^"']*)\1/gi
// String literals inside an expression, honouring the surrounding quote and simple escapes.
const stringLiteralPattern = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g

export function collectTailwindCandidates(html: string): string[] {
  const candidates = new Set<string>()
  const addClassList = (value: string) => {
    for (const candidate of value.split(/\s+/)) {
      if (candidate) candidates.add(candidate)
    }
  }
  for (const match of html.matchAll(staticClassPattern)) addClassList(match[2])
  for (const match of html.matchAll(transitionClassPattern)) addClassList(match[2])
  for (const match of html.matchAll(dynamicClassPattern)) {
    for (const literal of match[2].matchAll(stringLiteralPattern)) addClassList(literal[2])
  }
  return [...candidates]
}

function documentIsWellFormed(html: string): boolean {
  return /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html)
}

export const tailwindCompilerBase = __dirname

function buildCompiler() {
  return compile('@import "tailwindcss";', {
    // Finder-launched macOS applications commonly start with `/` as their working directory. Resolve
    // Tailwind from this module's packaged location instead, which remains inside the app's dependency
    // tree in development, tests, and the asar archive.
    base: tailwindCompilerBase,
    onDependency: () => undefined,
  })
}

// Compile the Tailwind CSS a single-page design needs into a standalone stylesheet string. Retained
// for the mock generator (which owns one whole document); multi-page agent output goes through
// compileTailwindCssForFiles below.
export async function compileTailwindCss(html: string): Promise<string> {
  if (!documentIsWellFormed(html)) {
    throw new Error('Generated design must contain html and body elements.')
  }
  const compiler = await buildCompiler()
  return compiler.build(collectTailwindCandidates(html))
}

// Class names an agent-authored script assigns live in its string literals (e.g. el.className =
// "grid gap-4"). Tailwind requires complete, static class strings, so splitting every literal on
// whitespace collects them; unrelated strings become candidates Tailwind simply produces no CSS for.
function collectScriptCandidates(source: string): string[] {
  const candidates = new Set<string>()
  for (const literal of source.matchAll(stringLiteralPattern)) {
    for (const token of literal[2].split(/\s+/)) if (token) candidates.add(token)
  }
  return [...candidates]
}

// Collect the union of Tailwind candidates across every page and script in a design, so one shared
// .build/tailwind.css covers all of its pages.
export function collectTailwindCandidatesForFiles(files: Readonly<Record<string, string>>): string[] {
  const candidates = new Set<string>()
  for (const [relativePath, content] of Object.entries(files)) {
    if (!isCandidateSource(relativePath)) continue
    const collected = /\.html?$/i.test(relativePath) ? collectTailwindCandidates(content) : collectScriptCandidates(content)
    for (const candidate of collected) candidates.add(candidate)
  }
  return [...candidates]
}

/**
 * Compile the one shared stylesheet a multi-page design links from every page. Requires at least one
 * page and validates that each discovered page is a well-formed document before compiling across the
 * whole file set. Agents never manage builds per page — OmniDesign owns this output.
 */
export async function compileTailwindCssForFiles(files: Readonly<Record<string, string>>): Promise<string> {
  const pages = discoverPages(files)
  if (!pages.length) throw new Error('Generated design must contain at least one HTML page.')
  for (const page of pages) {
    if (!documentIsWellFormed(files[page] ?? '')) {
      throw new Error(`Generated page ${page} must contain html and body elements.`)
    }
  }
  const compiler = await buildCompiler()
  return compiler.build(collectTailwindCandidatesForFiles(files))
}

// Designs may pull in external styles, fonts, plugins, and images over HTTPS, and may include inline
// scripts, so those are allowed. What stays forbidden is local-filesystem access: the sandboxed
// preview cannot read local files anyway, and file: references have no place in a portable export.
const blockedFilePatterns = [
  /(?:src|href)\s*=\s*["']\s*file:/i,
  /url\(\s*["']?\s*file:/i,
  /@import\s+["']\s*file:/i,
]

export function validateCompiledDesign(html: string): void {
  if (blockedFilePatterns.some((pattern) => pattern.test(html))) {
    throw new Error('Generated design references the local filesystem; file: URLs are not allowed.')
  }
}

/** Run the portability checks across every source file in a multi-file design. */
export function validateDesignFiles(files: Readonly<Record<string, string>>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    if (isCandidateSource(relativePath)) validateCompiledDesign(content)
  }
}

