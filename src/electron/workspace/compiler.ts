import { compile } from '@tailwindcss/node'
import path from 'node:path'

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

// Compile the Tailwind CSS a design needs into a standalone stylesheet string. The design's
// index.html links this as .build/tailwind.css rather than embedding a <style>, so the compiled
// output is a committed build artifact instead of being copied into the document.
export async function compileTailwindCss(html: string): Promise<string> {
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('Generated design must contain html and body elements.')
  }
  const compiler = await compile('@import "tailwindcss";', {
    base: path.resolve('.'),
    onDependency: () => undefined,
  })
  return compiler.build(collectTailwindCandidates(html))
}

export function validateCompiledDesign(html: string): void {
  // Designs may pull in external styles, fonts, plugins, and images over HTTPS, and may include
  // inline scripts, so those are allowed. What stays forbidden is local-filesystem access: the
  // sandboxed preview cannot read local files anyway, and file: references have no place in an
  // exported, portable design.
  const blockedPatterns = [
    /(?:src|href)\s*=\s*["']\s*file:/i,
    /url\(\s*["']?\s*file:/i,
    /@import\s+["']\s*file:/i,
  ]
  if (blockedPatterns.some((pattern) => pattern.test(html))) {
    throw new Error('Generated design references the local filesystem; file: URLs are not allowed.')
  }
}

export function findDesignQualityWarnings(html: string): string[] {
  const warnings: string[] = []
  if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html)) warnings.push('Set a language on the html element.')
  if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.test(html)) warnings.push('Add a responsive viewport meta tag.')
  const mainCount = html.match(/<main\b/gi)?.length ?? 0
  const headingCount = html.match(/<h1\b/gi)?.length ?? 0
  if (mainCount !== 1) warnings.push(`Use exactly one main landmark (found ${mainCount}).`)
  if (headingCount !== 1) warnings.push(`Use exactly one h1 heading (found ${headingCount}).`)
  return warnings
}
