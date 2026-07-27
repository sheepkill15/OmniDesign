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
    expect(body).toContain('<body class="p-4">Hi</body>')
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
