import { describe, expect, it } from 'vitest'
import { collectTailwindCandidates, compileDesignHtml, validateCompiledDesign } from './compiler.js'

describe('design compiler', () => {
  it('collects complete Tailwind candidates and emits offline CSS', async () => {
    const source = '<html><head></head><body class="bg-stone-950 text-white"><h1 class="text-5xl">Hello</h1></body></html>'
    expect(collectTailwindCandidates(source)).toEqual(['bg-stone-950', 'text-white', 'text-5xl'])

    const compiled = await compileDesignHtml(source)
    expect(compiled).toContain('<style>')
    expect(compiled).toContain('.bg-stone-950')
    expect(() => validateCompiledDesign(compiled)).not.toThrow()
  })

  it('rejects scripts, external resources, and malformed documents', async () => {
    await expect(compileDesignHtml('<main>Missing document</main>')).rejects.toThrow(/html and body/)
    expect(() => validateCompiledDesign('<html><body><script>alert(1)</script></body></html>')).toThrow(/unsafe/)
    expect(() => validateCompiledDesign('<html><body><img src="https://example.com/a.png"></body></html>')).toThrow(/unsafe/)
  })
})
