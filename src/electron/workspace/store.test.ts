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
    const first = store.addRevision(created.id, 'Create a calm dashboard', '<html><body>One</body></html>', 'mock', 'mock-v1', 'a'.repeat(40))
    store.addPrompt(created.id, 'Make the figures bolder')
    const second = store.addRevision(created.id, 'Make the figures bolder', '<html><body>Two</body></html>')
    store.saveDraft(created.id, 'Try a warmer accent')
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.draft).toBe('Try a warmer accent')
    expect(recovered?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(recovered?.revisions.map((revision) => revision.html)).toEqual(['<html><body>One</body></html>', '<html><body>Two</body></html>'])
    expect(recovered?.revisions[0].gitCommit).toBe('a'.repeat(40))
    expect(recovered?.revisions[1].gitCommit).toBeNull()
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

  it('persists assistant-only responses without adding a revision', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    store.addAssistantResponse(created.id, 'I can discuss this design without changing it.')
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.revisions).toHaveLength(0)
    expect(recovered?.messages).toMatchObject([
      { role: 'user', text: 'First' },
      { role: 'assistant', text: 'I can discuss this design without changing it.' },
    ])
    reopened.close()
  })

  it('persists preview diagnostics with the immutable revision that produced them', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const saved = store.addRevision(created.id, 'First', '<html><body>One</body></html>')
    const revisionId = saved.activeRevisionId!
    store.addPreviewDiagnostic(created.id, revisionId, {
      kind: 'runtime', level: 'error', message: 'Uncaught ReferenceError', source: 'omnidesign-preview://revision/token', line: 12,
    })
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getDesign(created.id)?.revisions[0].diagnostics).toMatchObject([
      { kind: 'runtime', level: 'error', message: 'Uncaught ReferenceError', line: 12 },
    ])
    reopened.close()
  })

  it('persists the workspace divider layout across reopen', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    store.saveLayout(created.id, { conversationWidth: 57 })
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getDesign(created.id)?.layout).toEqual({ conversationWidth: 57 })
    reopened.close()
  })

  it('stores a generated thumbnail outside the immutable revision snapshot', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const saved = store.addRevision(created.id, 'First', '<html><body>One</body></html>')
    store.saveThumbnail(created.id, saved.activeRevisionId!, Uint8Array.from([137, 80, 78, 71]))
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.thumbnailDataUrl).toBe('data:image/png;base64,iVBORw==')
    expect(recovered?.revisions[0].thumbnailDataUrl).toBe('data:image/png;base64,iVBORw==')
    reopened.close()
  })

  it('preserves a separate thumbnail for each revision while keeping the active one on the design', () => {
    const { store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const first = store.addRevision(created.id, 'First', '<html><body>One</body></html>')
    const second = store.addRevision(created.id, 'Second', '<html><body>Two</body></html>')
    store.saveThumbnail(created.id, first.revisions[0].id, Uint8Array.from([1]))
    store.saveThumbnail(created.id, second.revisions[1].id, Uint8Array.from([2]))

    const recovered = store.getDesign(created.id)
    expect(recovered?.thumbnailDataUrl).toBe('data:image/png;base64,Ag==')
    expect(recovered?.revisions.map((revision) => revision.thumbnailDataUrl)).toEqual(['data:image/png;base64,AQ==', 'data:image/png;base64,Ag=='])
    store.close()
  })

  it('persists invalid candidates outside completed revisions', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    store.addInvalidCandidate(created.id, 'Unsafe change', '<html><body><script>bad()</script></body></html>', 'Unsafe script.')
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.revisions).toHaveLength(0)
    expect(recovered?.invalidCandidates).toMatchObject([{ prompt: 'Unsafe change', diagnostic: 'Unsafe script.' }])
    expect(recovered?.messages.at(-1)?.role).toBe('system')
    reopened.close()
  })

  it('persists the selected application theme across reopen', () => {
    const { directory, store } = createStore()
    expect(store.getTheme()).toBe('dark')
    store.saveTheme('light')
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getTheme()).toBe('light')
    reopened.close()
  })
})
