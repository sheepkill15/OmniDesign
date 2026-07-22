import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    const first = store.addRevision(created.id, 'Create a calm dashboard', 'mock', 'mock-v1', 'a'.repeat(40))
    store.addPrompt(created.id, 'Make the figures bolder')
    const second = store.addRevision(created.id, 'Make the figures bolder')
    store.saveDraft(created.id, 'Try a warmer accent')
    store.close()

    const reopened = new WorkspaceStore(directory)
    const recovered = reopened.getDesign(created.id)
    expect(recovered?.draft).toBe('Try a warmer accent')
    expect(recovered?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(recovered?.revisions).toHaveLength(2)
    expect(recovered?.revisions[0].gitCommit).toBe('a'.repeat(40))
    expect(recovered?.revisions[1].gitCommit).toBeNull()
    expect(recovered?.activeRevisionId).toBe(second.activeRevisionId)
    expect(first.revisions[0].id).not.toBe(second.revisions[1].id)
    reopened.close()
  })

  it('restores history by appending a new head without removing later revisions', () => {
    const { store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const first = store.addRevision(created.id, 'First')
    const second = store.addRevision(created.id, 'Second')
    const restored = store.restoreRevision(created.id, first.revisions[0].id)

    expect(restored.revisions).toHaveLength(3)
    expect(restored.revisions[2].prompt).toBe('Restored: First')
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

  it('names a linked project after its source folder while keeping metadata separate from artifacts', () => {
    const { store } = createStore()
    const linked = store.createLinkedDesign('First', 'A calm dashboard', 'C:\\projects\\existing-app')

    expect(linked).toMatchObject({ title: 'A calm dashboard', projectName: 'existing-app', sourceProjectPath: 'C:\\projects\\existing-app' })
    store.close()
  })

  it('persists preview diagnostics with the immutable revision that produced them', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const saved = store.addRevision(created.id, 'First')
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

  it('persists the workspace layout mode and divider across reopen', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    store.saveLayout(created.id, { conversationWidth: 57, mode: 'preview' })
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getDesign(created.id)?.layout).toEqual({ conversationWidth: 57, mode: 'preview' })
    reopened.close()
  })

  it('defaults the layout mode to split for designs saved before the mode existed', () => {
    const { store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    expect(store.getDesign(created.id)?.layout).toEqual({ conversationWidth: 43, mode: 'split' })
    store.close()
  })

  it('stores a generated thumbnail outside the immutable revision snapshot', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const saved = store.addRevision(created.id, 'First')
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
    const first = store.addRevision(created.id, 'First')
    const second = store.addRevision(created.id, 'Second')
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

  it('groups designs under first-class projects and aggregates their activity', () => {
    const { store } = createStore()
    const first = store.createStandaloneDesign('A calm dashboard', 'Calm dashboard')
    store.createDesignInProject(first.projectId, 'A settings screen', 'Settings screen')

    const projects = store.listProjects()
    const project = projects.find((candidate) => candidate.id === first.projectId)
    expect(project).toMatchObject({ name: 'Calm dashboard', kind: 'standalone', designCount: 2 })
    expect(store.listDesignsByProject(first.projectId).map((design) => design.title)).toEqual(expect.arrayContaining(['Calm dashboard', 'Settings screen']))
    store.close()
  })

  it('reuses an existing linked project when the same folder is opened again', () => {
    const { store } = createStore()
    const first = store.createLinkedDesign('First', 'Existing app', 'C:\\projects\\existing-app')
    const second = store.createLinkedDesign('Second', 'Existing app', 'C:\\projects\\existing-app')

    expect(second.projectId).toBe(first.projectId)
    const projects = store.listProjects()
    expect(projects.filter((candidate) => candidate.sourceProjectPath === 'C:\\projects\\existing-app')).toHaveLength(1)
    expect(projects.find((candidate) => candidate.id === first.projectId)?.designCount).toBe(2)
    store.close()
  })

  it('keeps linked-design history available while a source folder is unavailable and can reconnect it', () => {
    const { store } = createStore()
    const missingFolder = path.join(tmpdir(), `omnidesign-missing-${randomUUID()}`)
    const linked = store.createLinkedDesign('First', 'Existing app', missingFolder)

    expect(store.getProjectSummary(linked.projectId)).toMatchObject({ sourceAvailable: false, sourceProjectPath: missingFolder })
    expect(store.getDesign(linked.id)?.title).toBe('Existing app')

    const replacement = mkdtempSync(path.join(tmpdir(), 'omnidesign-reconnected-'))
    directories.push(replacement)
    expect(store.reconnectProject(linked.projectId, replacement)).toMatchObject({ sourceAvailable: true, sourceProjectPath: replacement })
    store.close()
  })

  it('moves a standalone design and its associated project to recoverable trash without touching managed artifacts until purge', () => {
    const { directory, store } = createStore()
    const created = store.createStandaloneDesign('First', 'Design')
    const saved = store.addRevision(created.id, 'First')
    store.saveThumbnail(created.id, saved.activeRevisionId!, Uint8Array.from([1]))
    const artifactPath = path.join(directory, 'designs', created.id)
    expect(existsSync(artifactPath)).toBe(true)

    store.moveDesignToTrash(created.id)
    expect(store.getDesign(created.id)).toBeNull()
    expect(store.listProjects()).toHaveLength(0)
    expect(store.listTrash()).toMatchObject([{ id: created.id, kind: 'design', name: 'Design', projectId: created.projectId }])
    expect(existsSync(artifactPath)).toBe(true)

    store.close()
    const reopened = new WorkspaceStore(directory)
    expect(reopened.listTrash()).toMatchObject([{ id: created.id, kind: 'design', name: 'Design', projectId: created.projectId }])

    reopened.restoreDesign(created.id)
    expect(reopened.getDesign(created.id)?.revisions).toHaveLength(1)
    reopened.moveDesignToTrash(created.id)
    reopened.purgeTrashItem('design', created.id)
    expect(existsSync(artifactPath)).toBe(false)
    expect(reopened.listTrash()).toHaveLength(0)
    reopened.close()
  })

  it('moves only the selected design when it belongs to a linked project', () => {
    const { store } = createStore()
    const folder = mkdtempSync(path.join(tmpdir(), 'omnidesign-linked-'))
    directories.push(folder)
    const created = store.createLinkedDesign('First', 'Design', folder)

    store.moveDesignToTrash(created.id)

    expect(store.getProjectSummary(created.projectId)).not.toBeNull()
    expect(store.listTrash()).toMatchObject([{ id: created.id, kind: 'design', name: 'Design', projectId: created.projectId }])
    store.close()
  })

  it('restores a trashed project with all of its designs and preserves its linked source association', () => {
    const { store } = createStore()
    const folder = mkdtempSync(path.join(tmpdir(), 'omnidesign-linked-'))
    directories.push(folder)
    const first = store.createLinkedDesign('First', 'One', folder)
    const second = store.createDesignInProject(first.projectId, 'Second', 'Two')

    store.moveProjectToTrash(first.projectId)
    expect(store.listProjects()).toHaveLength(0)
    expect(store.listTrash()).toMatchObject([{ id: first.projectId, kind: 'project', sourceProjectPath: folder }])

    const restored = store.restoreProject(first.projectId)
    expect(restored).toMatchObject({ sourceProjectPath: folder, sourceAvailable: true, designCount: 2 })
    expect(store.getDesign(first.id)).not.toBeNull()
    expect(store.getDesign(second.id)).not.toBeNull()
    store.close()
  })

  it('reports the summary for a single project with its most recent design', () => {
    const { store } = createStore()
    const created = store.createStandaloneDesign('A calm dashboard', 'Calm dashboard')

    const summary = store.getProjectSummary(created.projectId)
    expect(summary).toMatchObject({ id: created.projectId, name: 'Calm dashboard', designCount: 1, latestDesignTitle: 'Calm dashboard', latestPrompt: 'A calm dashboard' })
    expect(store.getProjectSummary('missing-project')).toBeNull()
    store.close()
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

  it('persists the system notification preference across reopen', () => {
    const { directory, store } = createStore()
    expect(store.getNotificationsEnabled()).toBe(true)
    store.saveNotificationsEnabled(false)
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getNotificationsEnabled()).toBe(false)
    reopened.close()
  })

  it('persists the generation detail preference across reopen', () => {
    const { directory, store } = createStore()
    expect(store.getGenerationDetail()).toBe('full')
    store.saveGenerationDetail('concise')
    store.close()

    const reopened = new WorkspaceStore(directory)
    expect(reopened.getGenerationDetail()).toBe('concise')
    reopened.close()
  })

  it('persists attachment references without copying content and snapshots them on queued work', () => {
    const { directory, store } = createStore()
    const attachmentPath = path.join(directory, 'reference.txt')
    writeFileSync(attachmentPath, 'reference content')
    const attachment = { id: randomUUID(), path: attachmentPath, name: 'reference.txt', kind: 'file' as const, size: 17, modifiedAt: new Date().toISOString(), selectedAt: new Date().toISOString(), status: 'available' as const }
    const created = store.createStandaloneDesign('First', 'Design')

    store.saveDraft(created.id, 'Use the attached reference', [attachment])
    const queued = store.enqueueGenerationJob(created.id, 'Use the attached reference', 'mock', 'mock-v1', null, [attachment])

    expect(store.getDesign(created.id)?.draftAttachments).toHaveLength(1)
    expect(store.getGenerationJob(queued.id)?.attachments).toMatchObject([{ path: attachmentPath, name: 'reference.txt' }])
    expect(store.getDesign(created.id)?.messages.at(-1)).toMatchObject({ text: 'Use the attached reference', attachments: [{ path: attachmentPath, name: 'reference.txt' }] })
    expect(existsSync(attachmentPath)).toBe(true)
    store.close()
  })

  it('associates a standalone design with a linked project without changing its history', () => {
    const { store } = createStore()
    const standalone = store.createStandaloneDesign('First', 'Standalone')
    const revision = store.addRevision(standalone.id, 'First')
    const linked = store.createLinkedDesign('Linked', 'Linked design', 'C:\\projects\\linked-app')

    const associated = store.associateDesignWithProject(standalone.id, linked.projectId)

    expect(associated).toMatchObject({ projectId: linked.projectId, projectName: 'linked-app' })
    expect(associated.revisions).toHaveLength(1)
    expect(associated.activeRevisionId).toBe(revision.activeRevisionId)
    expect(store.getProjectSummary(standalone.projectId)).toBeNull()
    store.close()
  })
})
