import { writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import type { RevisionFiles } from './designRepository.js'
import { discoverPages, resolveEntryPage } from './pages.js'

// Bundle a revision's committed files (all pages plus the shared .build/ assets they link) into an
// offline ZIP. The relative paths are preserved so the exported pages resolve their links locally.
// The design must have at least one page, and the resolved entry page must be present.
export function createOfflineZip(files: RevisionFiles, preferredEntryPath?: string | null): Uint8Array {
  const entryPath = resolveEntryPage(discoverPages(files), preferredEntryPath)
  if (!entryPath || !files[entryPath]) throw new Error('Revision has no entry page to export.')
  const entries: Record<string, Uint8Array> = {}
  for (const [relativePath, content] of Object.entries(files)) entries[relativePath] = strToU8(content)
  return zipSync(entries, { level: 9 })
}

export function writeOfflineZip(files: RevisionFiles, destination: string, preferredEntryPath?: string | null): void {
  writeFileSync(destination, createOfflineZip(files, preferredEntryPath))
}
