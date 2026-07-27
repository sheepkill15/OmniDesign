import { describe, expect, it } from 'vitest'
import { injectPreviewShim, PREVIEW_MESSAGE_SOURCE } from './previewShim.js'

describe('preview shim injection', () => {
  it('injects the shim as the first thing inside <head> with the page path', () => {
    const html = '<!doctype html><html><head><title>Home</title></head><body>Hi</body></html>'
    const result = injectPreviewShim(html, 'about.html')

    const headOpen = result.indexOf('<head>')
    const shimIndex = result.indexOf('__OMNIDESIGN_PAGE__')
    const titleIndex = result.indexOf('<title>')
    expect(shimIndex).toBeGreaterThan(headOpen)
    // The shim runs before the page's own head content so console wrapping is in place early.
    expect(shimIndex).toBeLessThan(titleIndex)
    expect(result).toContain('window.__OMNIDESIGN_PAGE__="about.html"')
    expect(result).toContain(PREVIEW_MESSAGE_SOURCE)
    // The original document is preserved around the injection.
    expect(result).toContain('<title>Home</title>')
    expect(result).toContain('<body>Hi</body>')
  })

  it('handles a head tag with attributes', () => {
    const result = injectPreviewShim('<html><head lang="en"><meta charset="utf-8"></head><body></body></html>', 'index.html')
    expect(result).toContain('<head lang="en">')
    expect(result.indexOf('__OMNIDESIGN_PAGE__')).toBeGreaterThan(result.indexOf('<head lang="en">'))
  })

  it('prepends the shim when the document has no head', () => {
    const result = injectPreviewShim('<body>No head here</body>', 'index.html')
    expect(result.startsWith('<script>window.__OMNIDESIGN_PAGE__=')).toBe(true)
    expect(result).toContain('<body>No head here</body>')
  })

  it('escapes the page path safely', () => {
    const result = injectPreviewShim('<html><head></head><body></body></html>', 'pages/a"b.html')
    expect(result).toContain(String.raw`window.__OMNIDESIGN_PAGE__="pages/a\"b.html"`)
  })

  it('wires the pause/resume hooks that let the parent stop a frame animating without reloading', () => {
    const result = injectPreviewShim('<html><head></head><body></body></html>', 'index.html')
    expect(result).toContain('requestAnimationFrame')
    expect(result).toContain('omnidesign-pause')
    expect(result).toContain('omnidesign-resume')
  })

  it('supports focused selection through opaque source keys and suppresses authored clicks', () => {
    const result = injectPreviewShim('<html><head></head><body></body></html>', 'index.html')
    expect(result).toContain('omnidesign-selection-start')
    expect(result).toContain("getAttribute('data-od-source-key')")
    expect(result).toContain('event.preventDefault(); event.stopPropagation()')
    expect(result).toContain("event.key === 'Escape'")
    expect(result).toContain('od-focused-label')
    expect(result).toContain('@media(forced-colors:active)')
  })
})
