import { writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import type { Design } from './contracts.js'

export function createOfflineZip(design: Design, revisionId: string): Uint8Array {
  const revision = design.revisions.find((candidate) => candidate.id === revisionId)
  if (!revision) throw new Error('Revision not found.')
  return zipSync({ 'index.html': strToU8(revision.html) }, { level: 9 })
}

export function writeOfflineZip(design: Design, revisionId: string, destination: string): void {
  writeFileSync(destination, createOfflineZip(design, revisionId))
}
