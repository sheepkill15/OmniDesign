export interface RevisionPageAudit {
  readonly viewportWidth: number
  readonly documentWidth: number
  readonly hasMain: boolean
  readonly hasHeading: boolean
  readonly hasLanguage: boolean
  readonly hasViewportMeta: boolean
  readonly unnamedControlCount: number
  readonly brokenImageCount: number
}

export interface RevisionQualityFinding {
  readonly level: 'warning' | 'error'
  readonly message: string
  readonly source: string
  readonly line: null
}

export function findingsForPage(path: string, audit: RevisionPageAudit, includeDocumentChecks: boolean): RevisionQualityFinding[] {
  const findings: RevisionQualityFinding[] = []
  const overflow = Math.ceil(audit.documentWidth - audit.viewportWidth)
  if (overflow > 2) findings.push({ level: 'error', message: `Horizontal overflow at ${audit.viewportWidth} px (${overflow} px beyond the viewport).`, source: path, line: null })
  if (!includeDocumentChecks) return findings
  if (!audit.hasMain) findings.push({ level: 'warning', message: 'No main content landmark was found.', source: path, line: null })
  if (!audit.hasHeading) findings.push({ level: 'warning', message: 'No level-one heading was found.', source: path, line: null })
  if (!audit.hasLanguage) findings.push({ level: 'warning', message: 'The document language is not declared.', source: path, line: null })
  if (!audit.hasViewportMeta) findings.push({ level: 'warning', message: 'The responsive viewport metadata is missing.', source: path, line: null })
  if (audit.unnamedControlCount > 0) findings.push({ level: 'warning', message: `${audit.unnamedControlCount} interactive control${audit.unnamedControlCount === 1 ? ' does' : 's do'} not have an accessible name.`, source: path, line: null })
  if (audit.brokenImageCount > 0) findings.push({ level: 'error', message: `${audit.brokenImageCount} image${audit.brokenImageCount === 1 ? ' failed' : 's failed'} to load.`, source: path, line: null })
  return findings
}
