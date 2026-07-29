import { describe, expect, it } from 'vitest'
import { buildFocusedSourceMap, injectFocusedSourceKeys } from './focusedSourceMap.js'

describe('focused source maps', () => {
  it('maps authored elements to exact inclusive lines and injects opaque keys without changing the source map', () => {
    const html = `<html>\n<head></head>\n<body>\n  <main id="content">\n    <button data-od-id="save-action">Save</button>\n  </main>\n</body>\n</html>`
    const locations = buildFocusedSourceMap(html, 'pages/settings.html')
    const button = locations.find((location) => location.label === '<button>')
    expect(button).toMatchObject({ path: 'pages/settings.html', startLine: 5, endLine: 5, stableId: 'save-action' })
    expect(button?.excerpt).toBe('<button data-od-id="save-action">Save</button>')

    const injected = injectFocusedSourceKeys(html, locations)
    expect(injected).toContain(`<button data-od-id="save-action" data-od-source-key="${button?.id}">`)
    expect(html).not.toContain('data-od-source-key')
    expect(buildFocusedSourceMap(html, 'pages/settings.html').find((location) => location.label === '<button>')?.id).toBe(button?.id)
  })

  it('overwrites an authored source key so generated code cannot choose the privileged mapping id', () => {
    const html = '<html><head></head><body><div data-od-source-key="forged">Text</div></body></html>'
    const locations = buildFocusedSourceMap(html, 'index.html')
    const div = locations.find((location) => location.label === '<div>')!
    const injected = injectFocusedSourceKeys(html, locations)
    expect(injected).toContain(`data-od-source-key="${div.id}"`)
    expect(injected).not.toContain('data-od-source-key="forged"')
  })

  it('uses an inclusive multiline range and bounds excerpts from large authored elements', () => {
    const payload = 'x'.repeat(5_000)
    const html = `<html>\n<body>\n<section>\n${payload}\n</section>\n</body>\n</html>`
    const section = buildFocusedSourceMap(html, 'index.html').find((location) => location.label === '<section>')!

    expect(section).toMatchObject({ startLine: 3, endLine: 5 })
    expect(section.excerpt.length).toBeLessThanOrEqual(4_100)
    expect(section.excerpt).toContain('…')
  })
})
