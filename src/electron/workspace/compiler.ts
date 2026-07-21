import { compile } from '@tailwindcss/node'
import path from 'node:path'
import { alpineRuntimeBase64 } from './alpineRuntime.js'

// Marker attributes let a re-compile find and replace what an earlier compile injected, so compiling
// an already-compiled document stays idempotent instead of stacking a new copy every time.
const TAILWIND_STYLE_MARKER = 'data-omnidesign-tailwind'
const ALPINE_SCRIPT_MARKER = 'data-omnidesign-alpine'
const injectedStylePattern = new RegExp(`\\s*<style ${TAILWIND_STYLE_MARKER}>[\\s\\S]*?</style>`, 'gi')
const injectedScriptPattern = new RegExp(`\\s*<script ${ALPINE_SCRIPT_MARKER}>[\\s\\S]*?</script>`, 'gi')
// Only pay the cost of bundling Alpine when the design actually uses it (any x-*, @event, or :bind).
const alpineUsagePattern = /\sx-[a-z]|\s@[a-z]|\s:[a-z][\w-]*\s*=/i
const alpineRuntime = Buffer.from(alpineRuntimeBase64, 'base64').toString('utf8')

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

export async function compileDesignHtml(html: string): Promise<string> {
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('Generated design must contain html and body elements.')
  }

  // Strip anything a previous compile injected first — both so re-compiling does not duplicate it and
  // so the vendored Alpine source (which contains class-like text) can never pollute class collection.
  const source = html.replace(injectedStylePattern, '').replace(injectedScriptPattern, '')

  const compiler = await compile('@import "tailwindcss";', {
    base: path.resolve('.'),
    onDependency: () => undefined,
  })
  const css = compiler.build(collectTailwindCandidates(source))
  const injections = [`<style ${TAILWIND_STYLE_MARKER}>${css}</style>`]
  if (alpineUsagePattern.test(source)) injections.push(`<script ${ALPINE_SCRIPT_MARKER}>${alpineRuntime}</script>`)
  // Each injected block is preceded by a newline so the strip patterns above (which consume a leading
  // \s*) restore the exact source on the next compile — the round-trip is byte-for-byte idempotent.
  const injected = injections.map((block) => `\n${block}`).join('')
  return source.includes('</head>') ? source.replace('</head>', `${injected}</head>`) : `${injected}\n${source}`
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
