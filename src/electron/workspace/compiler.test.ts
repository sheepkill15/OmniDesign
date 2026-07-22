import { describe, expect, it } from 'vitest'
import { collectTailwindCandidates, compileTailwindCss, findDesignQualityWarnings, validateCompiledDesign } from './compiler.js'

describe('design compiler', () => {
  it('collects complete Tailwind candidates and compiles a standalone stylesheet', async () => {
    const source = '<html><head></head><body class="bg-stone-950 text-white"><h1 class="text-5xl">Hello</h1></body></html>'
    expect(collectTailwindCandidates(source)).toEqual(['bg-stone-950', 'text-white', 'text-5xl'])

    const css = await compileTailwindCss(source)
    expect(css).toContain('.bg-stone-950')
    expect(css).toContain('.text-5xl')
    // The compiler returns CSS only — no HTML wrapper, so nothing is copied into the document.
    expect(css).not.toContain('<style')
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

    const css = await compileTailwindCss(source)
    expect(css).toContain('.bg-blue-500')
    expect(css).toContain('.items-center')
  })

  it('allows scripts and external HTTPS resources but rejects local files and malformed documents', async () => {
    await expect(compileTailwindCss('<main>Missing document</main>')).rejects.toThrow(/html and body/)
    // Inline scripts and external HTTPS styles, fonts, plugins, and images are permitted.
    expect(() => validateCompiledDesign('<html><body><script>console.log(1)</script></body></html>')).not.toThrow()
    expect(() => validateCompiledDesign('<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body><img src="https://example.com/a.png"></body></html>')).not.toThrow()
    // The relative .build/ links used by the starter page validate.
    expect(() => validateCompiledDesign('<html><head><link rel="stylesheet" href=".build/tailwind.css"><script defer src=".build/alpine.js"></script></head><body></body></html>')).not.toThrow()
    // Local filesystem access stays blocked.
    expect(() => validateCompiledDesign('<html><body><img src="file:///C:/secret.png"></body></html>')).toThrow(/file:/)
  })

  it('reports the baseline semantic document quality required for generated designs', () => {
    expect(findDesignQualityWarnings('<html><head></head><body><h2>Dashboard</h2></body></html>')).toEqual([
      'Set a language on the html element.',
      'Add a responsive viewport meta tag.',
      'Use exactly one main landmark (found 0).',
      'Use exactly one h1 heading (found 0).',
    ])
    expect(findDesignQualityWarnings('<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Dashboard</h1></main></body></html>')).toEqual([])
  })
})
