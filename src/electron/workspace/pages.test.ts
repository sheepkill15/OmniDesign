import { describe, expect, it } from 'vitest'
import { discoverPages, isBuildPath, isCandidateSource, isHtmlPage, resolveEntryPage } from './pages.js'

describe('page discovery', () => {
  it('classifies build artifacts, pages, and candidate sources', () => {
    expect(isBuildPath('.build/tailwind.css')).toBe(true)
    expect(isBuildPath('assets/app.js')).toBe(false)
    expect(isHtmlPage('index.html')).toBe(true)
    expect(isHtmlPage('pages/about.html')).toBe(true)
    expect(isHtmlPage('.build/preview.html')).toBe(false)
    expect(isHtmlPage('assets/app.js')).toBe(false)
    expect(isCandidateSource('index.html')).toBe(true)
    expect(isCandidateSource('assets/app.js')).toBe(true)
    expect(isCandidateSource('.build/alpine.js')).toBe(false)
    expect(isCandidateSource('assets/logo.svg')).toBe(false)
  })

  it('orders pages with index.html first, then lexically', () => {
    const files = { 'pricing.html': '', 'index.html': '', 'about.html': '', '.build/tailwind.css': '', 'assets/app.js': '' }
    expect(discoverPages(files)).toEqual(['index.html', 'about.html', 'pricing.html'])
  })

  it('resolves the entry page: preference, then index.html, then first page', () => {
    expect(resolveEntryPage(['index.html', 'about.html'])).toBe('index.html')
    expect(resolveEntryPage(['about.html', 'contact.html'])).toBe('about.html')
    expect(resolveEntryPage(['index.html', 'about.html'], 'about.html')).toBe('about.html')
    // A stale preference that no longer exists falls back to the normal resolution.
    expect(resolveEntryPage(['index.html', 'about.html'], 'gone.html')).toBe('index.html')
    expect(resolveEntryPage([])).toBeNull()
  })
})
