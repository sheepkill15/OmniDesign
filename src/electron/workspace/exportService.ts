import { writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import type { RevisionFiles } from './designRepository.js'

// Bundle a revision's committed files (index.html plus the .build/ assets it links) into an offline
// ZIP. The relative paths are preserved so the exported index.html resolves its links locally.
export function createOfflineZip(files: RevisionFiles): Uint8Array {
  if (!files['index.html']) throw new Error('Revision has no index.html to export.')
  const entries: Record<string, Uint8Array> = {}
  for (const [relativePath, content] of Object.entries(files)) entries[relativePath] = strToU8(content)
  return zipSync(entries, { level: 9 })
}

export function writeOfflineZip(files: RevisionFiles, destination: string): void {
  writeFileSync(destination, createOfflineZip(files))
}
