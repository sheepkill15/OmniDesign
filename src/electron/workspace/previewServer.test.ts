import { describe, expect, it } from 'vitest'
import { PreviewContentServer } from './previewServer.js'

// A minimal stand-in for an Electron Session that just captures the registered protocol handler so the
// serving path can be exercised without a running Electron app.
function fakeSession() {
  let handler: ((request: { url: string }) => Response) | null = null
  const session = {
    protocol: {
      isProtocolHandled: () => false,
      handle: (_scheme: string, fn: (request: { url: string }) => Response) => { handler = fn },
      unhandle: () => undefined,
    },
  }
  return { session, invoke: (url: string) => handler!({ url }) }
}

const html = '<!doctype html><html><head><title>Home</title></head><body class="p-4">Hi</body></html>'

describe('PreviewContentServer', () => {
  it('serves a registered page as shim-injected HTML with the preview CSP', async () => {
    const { session, invoke } = fakeSession()
    const server = new PreviewContentServer(session as never, 'file:')
    const token = server.register('design-1', 'revision-1', { 'index.html': html, '.build/tailwind.css': '.p-4{padding:1rem}' })

    const response = invoke(`omnidesign-preview://revision/${token}/index.html`)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/html')
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors file:')
    expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'none'")
    const body = await response.text()
    expect(body).toContain('__OMNIDESIGN_PAGE__="index.html"')
    expect(body).toMatch(/data-od-source-key="[0-9a-f-]{36}"/)
    expect(body).toMatch(/<body class="p-4" data-od-source-key="[0-9a-f-]{36}">Hi<\/body>/)
  })

  it('resolves only opaque locations registered for the exact design, revision, token, and page', async () => {
    const { session, invoke } = fakeSession()
    const server = new PreviewContentServer(session as never, 'file:')
    const token = server.register('design-1', 'revision-1', { 'index.html': html })
    const body = await invoke(`omnidesign-preview://revision/${token}/index.html`).text()
    const locationId = body.match(/<body[^>]*data-od-source-key="([0-9a-f-]{36})"/)?.[1]
    expect(locationId).toBeTruthy()

    expect(server.resolveFocusedTarget({ token, designId: 'design-1', revisionId: 'revision-1', page: 'index.html', locationId: locationId!, clickedLabel: '<span.dynamic>', usedAncestor: true })).toMatchObject({
      designId: 'design-1', revisionId: 'revision-1', path: 'index.html', startLine: 1, endLine: 1, label: '<body.p-4>', dynamicDescription: '<span.dynamic>',
    })
    expect(server.resolveFocusedTarget({ token, designId: 'design-1', revisionId: 'revision-forged', page: 'index.html', locationId: locationId!, clickedLabel: '<body>', usedAncestor: false })).toBeNull()
    expect(server.resolveFocusedTarget({ token, designId: 'design-1', revisionId: 'revision-1', page: 'other.html', locationId: locationId!, clickedLabel: '<body>', usedAncestor: false })).toBeNull()
    const resolved = server.resolveFocusedTarget({ token, designId: 'design-1', revisionId: 'revision-1', page: 'index.html', locationId: locationId!, clickedLabel: '<body>', usedAncestor: false })!
    expect(server.validatesFocusedTarget(resolved)).toBe(true)
    expect(server.validatesFocusedTarget({ ...resolved, path: 'forged.html' })).toBe(false)
    expect(server.validatesFocusedTarget({ ...resolved, startLine: 99, endLine: 99 })).toBe(false)
    expect(server.validatesFocusedTarget({ ...resolved, revisionId: 'revision-forged' })).toBe(false)
  })

  it('locates historical targets in the current revision only by unique stable identity or unchanged source', async () => {
    const { session, invoke } = fakeSession()
    const server = new PreviewContentServer(session as never, 'file:')
    const oldHtml = '<html><body><button data-od-id="cta">Buy now</button><p>Keep this copy</p><span>Repeated</span></body></html>'
    const oldToken = server.register('design-1', 'revision-1', { 'index.html': oldHtml })
    const oldBody = await invoke(`omnidesign-preview://revision/${oldToken}/index.html`).text()
    const locationFor = (tag: string) => oldBody.match(new RegExp(`<${tag}[^>]*data-od-source-key="([0-9a-f-]{36})"`))?.[1]
    const stableTarget = server.resolveFocusedTarget({ token: oldToken, designId: 'design-1', revisionId: 'revision-1', page: 'index.html', locationId: locationFor('button')!, clickedLabel: '<button>', usedAncestor: false })!
    const sourceTarget = server.resolveFocusedTarget({ token: oldToken, designId: 'design-1', revisionId: 'revision-1', page: 'index.html', locationId: locationFor('p')!, clickedLabel: '<p>', usedAncestor: false })!
    const ambiguousTarget = server.resolveFocusedTarget({ token: oldToken, designId: 'design-1', revisionId: 'revision-1', page: 'index.html', locationId: locationFor('span')!, clickedLabel: '<span>', usedAncestor: false })!

    const currentHtml = '<html><body><header>New</header><button data-od-id="cta">Buy today</button><p>Keep this copy</p><span>Repeated</span><span>Repeated</span></body></html>'
    const currentToken = server.register('design-1', 'revision-2', { 'index.html': currentHtml })
    const located = server.locateFocusedTargets({ token: currentToken, designId: 'design-1', revisionId: 'revision-2', targets: [
      { id: 'stable', target: stableTarget },
      { id: 'source', target: sourceTarget },
      { id: 'ambiguous', target: ambiguousTarget },
      { id: 'foreign', target: { ...stableTarget, designId: 'other-design' } },
    ] })

    expect(located.map((item) => item.id)).toEqual(['stable', 'source'])
    expect(located.every((item) => /^[0-9a-f-]{36}$/.test(item.locationId))).toBe(true)
    expect(server.locateFocusedTargets({ token: oldToken, designId: 'design-1', revisionId: 'revision-2', targets: [{ id: 'wrong-token', target: stableTarget }] })).toEqual([])
  })

  it('serves build assets verbatim (no shim) and stable tokens per revision', async () => {
    const { session, invoke } = fakeSession()
    const server = new PreviewContentServer(session as never, "'none'")
    const token = server.register('design-1', 'revision-1', { 'index.html': html, '.build/tailwind.css': '.p-4{padding:1rem}' })
    // Re-registering the same revision reuses its token.
    expect(server.register('design-1', 'revision-1', { 'index.html': html })).toBe(token)

    const css = invoke(`omnidesign-preview://revision/${token}/.build/tailwind.css`)
    expect(css.headers.get('Content-Type')).toContain('text/css')
    const cssBody = await css.text()
    expect(cssBody).toBe('.p-4{padding:1rem}')
    expect(cssBody).not.toContain('__OMNIDESIGN_PAGE__')
  })

  it('404s an unknown token or missing file, and rejects a non-preview URL', async () => {
    const { session, invoke } = fakeSession()
    const server = new PreviewContentServer(session as never, 'file:')
    const token = server.register('design-1', 'revision-1', { 'index.html': html })

    expect(invoke('omnidesign-preview://revision/unknown-token/index.html').status).toBe(404)
    expect(invoke(`omnidesign-preview://revision/${token}/missing.html`).status).toBe(404)
    expect(invoke('https://example.com/evil').status).toBe(404)
  })
})
