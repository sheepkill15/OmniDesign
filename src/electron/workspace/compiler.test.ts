import { describe, expect, it } from 'vitest'
import { collectTailwindCandidates, collectTailwindCandidatesForFiles, compileTailwindCss, compileTailwindCssForFiles, validateCompiledDesign, validateDesignFiles } from './compiler.js'

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

  it('compiles one shared stylesheet across every page and script of a multi-page design', async () => {
    const files = {
      'index.html': '<html><head></head><body class="bg-stone-950"><a href="about.html" class="underline">About</a></body></html>',
      'about.html': '<html><head></head><body class="text-white"><h1 class="text-5xl">About</h1></body></html>',
      'assets/app.js': 'const cls = "grid gap-4"',
      '.build/tailwind.css': '',
    }
    expect(collectTailwindCandidatesForFiles(files)).toEqual(expect.arrayContaining(['bg-stone-950', 'underline', 'text-white', 'text-5xl', 'grid', 'gap-4']))

    const css = await compileTailwindCssForFiles(files)
    expect(css).toContain('.bg-stone-950')
    expect(css).toContain('.text-5xl')
    expect(css).toContain('.gap-4')
  })

  it('rejects a multi-page design where a page is not a well-formed document', async () => {
    await expect(compileTailwindCssForFiles({ 'index.html': '<html><body>ok</body></html>', 'broken.html': '<main>no doc</main>' }))
      .rejects.toThrow(/broken\.html/)
  })

  it('requires at least one page to compile', async () => {
    await expect(compileTailwindCssForFiles({ '.build/tailwind.css': '' })).rejects.toThrow(/at least one/)
  })

  it('validates portability across every source file', () => {
    expect(() => validateDesignFiles({ 'index.html': '<html><body>ok</body></html>', 'about.html': '<html><body><img src="file:///c:/x.png"></body></html>' }))
      .toThrow(/file:/)
    // The compiled stylesheet and vendored runtime under .build are not re-validated as source.
    expect(() => validateDesignFiles({ 'index.html': '<html><body>ok</body></html>', '.build/alpine.js': 'file:whatever' })).not.toThrow()
  })
})
