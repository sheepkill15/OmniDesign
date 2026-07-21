import { describe, expect, it } from 'vitest'
import { collectTailwindCandidates, compileDesignHtml, validateCompiledDesign } from './compiler.js'

describe('design compiler', () => {
  it('collects complete Tailwind candidates and emits offline CSS', async () => {
    const source = '<html><head></head><body class="bg-stone-950 text-white"><h1 class="text-5xl">Hello</h1></body></html>'
    expect(collectTailwindCandidates(source)).toEqual(['bg-stone-950', 'text-white', 'text-5xl'])

    const compiled = await compileDesignHtml(source)
    expect(compiled).toContain('<style data-omnidesign-tailwind>')
    expect(compiled).toContain('.bg-stone-950')
    // A design without Alpine directives should not carry the Alpine runtime.
    expect(compiled).not.toContain('data-omnidesign-alpine')
    expect(() => validateCompiledDesign(compiled)).not.toThrow()
  })

  it('collects Tailwind classes from Alpine dynamic bindings and transitions', async () => {
    const source = [
      '<html><head></head><body>',
      `<div :class="{ 'hidden': !open, 'flex items-center': open }"></div>`,
      `<button x-bind:class="active ? 'bg-blue-500' : 'bg-gray-200'"></button>`,
      `<div x-transition:enter="transition ease-out duration-300" class="p-4"></div>`,
      '</body></html>',
    ].join('')

    const candidates = collectTailwindCandidates(source)
    expect(candidates).toEqual(expect.arrayContaining([
      'p-4', 'hidden', 'flex', 'items-center', 'bg-blue-500', 'bg-gray-200', 'transition', 'ease-out', 'duration-300',
    ]))
    // Expression punctuation must not leak in as candidates.
    expect(candidates).not.toContain('{')
    expect(candidates).not.toContain('?')

    const compiled = await compileDesignHtml(source)
    expect(compiled).toContain('.bg-blue-500')
    expect(compiled).toContain('.items-center')
    // Because the markup uses Alpine, its runtime is injected locally (no external CDN).
    expect(compiled).toContain('data-omnidesign-alpine')
  })

  it('injects Tailwind and Alpine exactly once even when re-compiling an already-compiled document', async () => {
    const source = '<html><head></head><body class="p-4"><div x-data="{ open: false }" x-show="open"></div></body></html>'
    const once = await compileDesignHtml(source)
    const twice = await compileDesignHtml(once)

    const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1
    expect(countOf(twice, 'data-omnidesign-tailwind')).toBe(1)
    expect(countOf(twice, 'data-omnidesign-alpine')).toBe(1)
    expect(countOf(twice, '<style ')).toBe(1)
    // Re-compiling is stable: the second pass produces the same document as the first.
    expect(twice).toBe(once)
    expect(() => validateCompiledDesign(twice)).not.toThrow()
  })

  it('allows scripts and external HTTPS resources but rejects local files and malformed documents', async () => {
    await expect(compileDesignHtml('<main>Missing document</main>')).rejects.toThrow(/html and body/)
    // Inline scripts and external HTTPS styles, fonts, plugins, and images are permitted.
    expect(() => validateCompiledDesign('<html><body><script>console.log(1)</script></body></html>')).not.toThrow()
    expect(() => validateCompiledDesign('<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body><img src="https://example.com/a.png"></body></html>')).not.toThrow()
    // External HTTPS plugin scripts (e.g. a charting library from a CDN) must validate.
    expect(() => validateCompiledDesign('<html><head><script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js"></script></head><body></body></html>')).not.toThrow()
    // Local filesystem access stays blocked.
    expect(() => validateCompiledDesign('<html><body><img src="file:///C:/secret.png"></body></html>')).toThrow(/file:/)
  })
})
