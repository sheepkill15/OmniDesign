import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createOfflineZip } from './exportService.js'

describe('offline export', () => {
  it('bundles the revision entry page together with its build assets', () => {
    const zip = createOfflineZip({
      'index.html': '<html><body>First</body></html>',
      '.build/tailwind.css': '.p-4{padding:1rem}',
      '.build/alpine.js': '/* alpine */',
    })

    const files = unzipSync(zip)
    expect(Object.keys(files).sort()).toEqual(['.build/alpine.js', '.build/tailwind.css', 'index.html'])
    expect(strFromU8(files['index.html'])).toBe('<html><body>First</body></html>')
    expect(strFromU8(files['.build/tailwind.css'])).toBe('.p-4{padding:1rem}')
  })

  it('bundles every page of a multi-page design and preserves nested paths', () => {
    const zip = createOfflineZip({
      'index.html': '<html><body>Home</body></html>',
      'about.html': '<html><body>About</body></html>',
      'pages/pricing.html': '<html><body>Pricing</body></html>',
      '.build/tailwind.css': '.p-4{padding:1rem}',
      '.build/alpine.js': '/* alpine */',
    })

    const files = unzipSync(zip)
    expect(Object.keys(files).sort()).toEqual(['.build/alpine.js', '.build/tailwind.css', 'about.html', 'index.html', 'pages/pricing.html'])
    expect(strFromU8(files['pages/pricing.html'])).toBe('<html><body>Pricing</body></html>')
  })

  it('exports a design whose entry page is not index.html', () => {
    expect(() => createOfflineZip({ 'home.html': '<html><body>Home</body></html>' })).not.toThrow()
  })

  it('requires at least one page', () => {
    expect(() => createOfflineZip({ '.build/tailwind.css': '.p-4{padding:1rem}' })).toThrow(/entry page/)
  })
})
