import { BUILD_DIR, ENTRY_HTML_PATH } from './designRepository.js'

// Pages are discovered from a design's committed files rather than declared by the agent. Every
// *.html file outside the managed .build/ directory is a page; index.html is the home page when
// present, otherwise the first discovered page wins.

export function isBuildPath(relativePath: string): boolean {
  return relativePath === BUILD_DIR || relativePath.startsWith(`${BUILD_DIR}/`)
}

/** An agent-authored HTML page: a top-level or nested *.html file that is not a build artifact. */
export function isHtmlPage(relativePath: string): boolean {
  return !isBuildPath(relativePath) && /\.html?$/i.test(relativePath)
}

/**
 * Source files whose contents can carry Tailwind class names: the HTML pages plus any agent-authored
 * JavaScript modules. Build artifacts (compiled CSS, the vendored Alpine runtime) are excluded.
 */
export function isCandidateSource(relativePath: string): boolean {
  return !isBuildPath(relativePath) && /\.(html?|js|mjs|ts)$/i.test(relativePath)
}

/** Discover the design's pages from a file map, ordered with index.html first, then lexically. */
export function discoverPages(files: Readonly<Record<string, string>>): string[] {
  return Object.keys(files)
    .filter(isHtmlPage)
    .sort((a, b) => {
      if (a === ENTRY_HTML_PATH) return -1
      if (b === ENTRY_HTML_PATH) return 1
      return a.localeCompare(b)
    })
}

/**
 * Resolve which page is the home/entry page. A persisted preference wins when it still exists;
 * otherwise index.html if present, otherwise the first discovered page, otherwise null.
 */
export function resolveEntryPage(pagePaths: readonly string[], preferred?: string | null): string | null {
  if (preferred && pagePaths.includes(preferred)) return preferred
  if (pagePaths.includes(ENTRY_HTML_PATH)) return ENTRY_HTML_PATH
  return pagePaths[0] ?? null
}
