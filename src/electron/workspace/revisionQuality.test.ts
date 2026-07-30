import { describe, expect, it } from 'vitest'
import { findingsForPage, type RevisionPageAudit } from './revisionQuality'

const healthyAudit: RevisionPageAudit = {
  viewportWidth: 390,
  documentWidth: 390,
  hasMain: true,
  hasHeading: true,
  hasLanguage: true,
  hasViewportMeta: true,
  unnamedControlCount: 0,
  brokenImageCount: 0,
}

describe('revision quality findings', () => {
  it('passes a responsive, semantic page without findings', () => {
    expect(findingsForPage('index.html', healthyAudit, true)).toEqual([])
  })

  it('reports viewport overflow with its tested width', () => {
    expect(findingsForPage('pricing.html', { ...healthyAudit, documentWidth: 438 }, false)).toEqual([
      { level: 'error', message: 'Horizontal overflow at 390 px (48 px beyond the viewport).', source: 'pricing.html', line: null },
    ])
  })

  it('reports actionable document and accessibility problems once per page', () => {
    const findings = findingsForPage('index.html', { ...healthyAudit, hasMain: false, hasHeading: false, hasLanguage: false, hasViewportMeta: false, unnamedControlCount: 2, brokenImageCount: 1 }, true)
    expect(findings.map((finding) => finding.message)).toEqual([
      'No main content landmark was found.',
      'No level-one heading was found.',
      'The document language is not declared.',
      'The responsive viewport metadata is missing.',
      '2 interactive controls do not have an accessible name.',
      '1 image failed to load.',
    ])
  })
})
