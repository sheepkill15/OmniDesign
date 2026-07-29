import { randomUUID } from 'node:crypto'
import type { Session } from 'electron'
import { isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'
import { injectPreviewShim } from './previewShim.js'
import { isHtmlPage } from './pages.js'
import type { RevisionFiles } from './designRepository.js'
import { buildFocusedSourceMap, injectFocusedSourceKeys, type FocusedSourceLocation } from './focusedSourceMap.js'
import { focusedTargetSchema, type FocusedTarget } from './contracts.js'

function contentTypeFor(relativePath: string): string {
  if (relativePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (relativePath.endsWith('.js') || relativePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (relativePath.endsWith('.svg')) return 'image/svg+xml'
  if (relativePath.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'text/html; charset=utf-8'
}

// The most recent revisions kept addressable at once. A design workspace previews one revision at a
// time, but keeping a few lets quick history hops and canvas re-renders avoid re-registering.
const MAX_REGISTERED_REVISIONS = 16

/**
 * Serves previewed design files over the privileged `omnidesign-preview://` scheme so the trusted
 * renderer can embed each page in a sandboxed, opaque-origin iframe. Each registered revision gets an
 * opaque token; the served HTML carries the restrictive preview CSP (with frame-ancestors relaxed just
 * enough for the renderer to embed it) and the injected height/diagnostics/page shim. This replaces the
 * Phase 1 native WebContentsView surface — there is no view to attach, freeze, or capture here.
 */
export class PreviewContentServer {
  private readonly tokens = new Map<string, { readonly files: RevisionFiles; readonly key: string; readonly designId: string; readonly revisionId: string; readonly locations: ReadonlyMap<string, ReadonlyMap<string, FocusedSourceLocation>> }>()
  private readonly byKey = new Map<string, string>()

  public constructor(private readonly previewSession: Session, private readonly frameAncestors: string) {
    if (this.previewSession.protocol.isProtocolHandled('omnidesign-preview')) this.previewSession.protocol.unhandle('omnidesign-preview')
    void this.previewSession.protocol.handle('omnidesign-preview', (request) => this.handleRequest(request.url))
  }

  /** Register a revision's files and return the opaque token the renderer builds page URLs from. */
  public register(designId: string, revisionId: string, files: RevisionFiles): string {
    const key = `${designId}\u0000${revisionId}`
    const existing = this.byKey.get(key)
    if (existing) return existing
    const token = randomUUID()
    const locations = new Map<string, ReadonlyMap<string, FocusedSourceLocation>>()
    for (const [relativePath, content] of Object.entries(files)) {
      if (!isHtmlPage(relativePath) && !relativePath.endsWith('.html')) continue
      const pageLocations = buildFocusedSourceMap(content, relativePath)
      locations.set(relativePath, new Map(pageLocations.map((location) => [location.id, location])))
    }
    this.byKey.set(key, token)
    this.tokens.set(token, { files, key, designId, revisionId, locations })
    while (this.tokens.size > MAX_REGISTERED_REVISIONS) {
      const oldest = this.tokens.keys().next().value as string | undefined
      if (!oldest) break
      const entry = this.tokens.get(oldest)
      this.tokens.delete(oldest)
      if (entry) this.byKey.delete(entry.key)
    }
    return token
  }

  public resolveFocusedTarget(input: { readonly token: string; readonly designId: string; readonly revisionId: string; readonly page: string; readonly locationId: string; readonly clickedLabel: string; readonly usedAncestor: boolean }): FocusedTarget | null {
    const entry = this.tokens.get(input.token)
    if (!entry || entry.designId !== input.designId || entry.revisionId !== input.revisionId) return null
    const location = entry.locations.get(input.page)?.get(input.locationId)
    if (!location || location.path !== input.page) return null
    return focusedTargetSchema.parse({
      designId: entry.designId,
      revisionId: entry.revisionId,
      locationId: location.id,
      path: location.path,
      startLine: location.startLine,
      endLine: location.endLine,
      label: location.label,
      stableId: location.stableId,
      excerpt: location.excerpt,
      dynamicDescription: input.usedAncestor ? input.clickedLabel : null,
    })
  }

  public locateFocusedTargets(input: { readonly token: string; readonly designId: string; readonly revisionId: string; readonly targets: readonly { readonly id: string; readonly target: FocusedTarget }[] }): readonly { readonly id: string; readonly locationId: string }[] {
    const entry = this.tokens.get(input.token)
    if (!entry || entry.designId !== input.designId || entry.revisionId !== input.revisionId) return []
    return input.targets.flatMap(({ id, target }) => {
      if (target.designId !== input.designId) return []
      const locations = [...(entry.locations.get(target.path)?.values() ?? [])]
      if (!locations.length) return []
      if (target.revisionId === input.revisionId && target.locationId) {
        const exact = locations.find((location) => location.id === target.locationId)
        if (exact) return [{ id, locationId: exact.id }]
      }
      if (target.stableId) {
        const stableMatches = locations.filter((location) => location.stableId === target.stableId)
        if (stableMatches.length === 1) return [{ id, locationId: stableMatches[0].id }]
      }
      const sourceMatches = locations.filter((location) => location.label === target.label && location.excerpt === target.excerpt)
      return sourceMatches.length === 1 ? [{ id, locationId: sourceMatches[0].id }] : []
    })
  }

  public validatesFocusedTarget(target: FocusedTarget): boolean {
    const token = this.byKey.get(`${target.designId}\0${target.revisionId}`)
    const entry = token ? this.tokens.get(token) : undefined
    const locations = entry?.locations.get(target.path)
    if (!locations) return false
    return [...locations.values()].some((location) =>
      (target.locationId == null || location.id === target.locationId)
      &&
      location.path === target.path
      && location.startLine === target.startLine
      && location.endLine === target.endLine
      && location.label === target.label
      && location.stableId === target.stableId
      && location.excerpt === target.excerpt)
  }

  public dispose(): void {
    this.tokens.clear()
    this.byKey.clear()
    if (this.previewSession.protocol.isProtocolHandled('omnidesign-preview')) this.previewSession.protocol.unhandle('omnidesign-preview')
  }

  private handleRequest(url: string): Response {
    if (!isAllowedPreviewUrl(url)) return new Response('Not found', { status: 404 })
    // pathname is /<token>/<relative file path>, e.g. /<token>/index.html or /<token>/.build/tailwind.css
    const [token, ...pathSegments] = new URL(url).pathname.replace(/^\/+/, '').split('/')
    const relativePath = pathSegments.join('/') || 'index.html'
    const entry = token ? this.tokens.get(token) : undefined
    const content = entry?.files[relativePath]
    if (content === undefined) return new Response('Not found', { status: 404 })
    const pageLocations = entry?.locations.get(relativePath)
    const sourceMapped = pageLocations ? injectFocusedSourceKeys(content, [...pageLocations.values()]) : content
    const body = isHtmlPage(relativePath) || relativePath.endsWith('.html') ? injectPreviewShim(sourceMapped, relativePath) : content
    return new Response(body, {
      headers: {
        'Content-Type': contentTypeFor(relativePath),
        'Content-Security-Policy': previewContentSecurityPolicy(this.frameAncestors),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}
