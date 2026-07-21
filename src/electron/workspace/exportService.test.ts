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

  it('requires an index.html entry', () => {
    expect(() => createOfflineZip({ '.build/tailwind.css': '.p-4{padding:1rem}' })).toThrow(/index\.html/)
  })
})
