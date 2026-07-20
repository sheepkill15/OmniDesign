import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceStore } from './store.js'

const directories: string[] = []

function createStore(): { directory: string; store: WorkspaceStore } {
  const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-store-'))
  directories.push(directory)
  return { directory, store: new WorkspaceStore(directory) }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('WorkspaceStore', () => {
  it('persists conversations, drafts, and immutable revision files across reopen', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('Create a calm dashboard', 'Calm dashboard')
    const first = store.addRevision(created.id, 'Create a calm dashboard', '<html><body>One</body></html>')
    store.addPrompt(created.id, 'Make the figures bolder')
    const second = store.addRevision(created.id, 'Make the figures bolder', '<html><body>Two</body></html>')
    store.saveDraft(created.id, 'Try a warmer accent')
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.draft).toBe('Try a warmer accent')
    expect(recovered?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(recovered?.revisions.map((revision) => revision.html)).toEqual(['<html><body>One</body></html>', '<html><body>Two</body></html>'])
    expect(recovered?.activeRevisionId).toBe(second.activeRevisionId)
    expect(first.revisions[0].id).not.toBe(second.revisions[1].id)
    reopened.close()
  })

  it('restores history by appending a new head without removing later revisions', () => {
    const { store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const first = store.addRevision(created.id, 'First', '<html><body>One</body></html>')
    const second = store.addRevision(created.id, 'Second', '<html><body>Two</body></html>')
    const restored = store.restoreRevision(created.id, first.revisions[0].id)

    expect(restored.revisions).toHaveLength(3)
    expect(restored.revisions[2].html).toBe(restored.revisions[0].html)
    expect(restored.revisions[2].parentRevisionId).toBe(second.activeRevisionId)
    expect(restored.activeRevisionId).toBe(restored.revisions[2].id)
    store.close()
  })
})
