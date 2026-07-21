import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GenerationActivity } from './contracts.js'
import { WorkspaceService } from './workspaceService.js'
import { WorkspaceStore } from './store.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('WorkspaceService', () => {
  it('runs creation and iteration through generation, compilation, validation, and immutable persistence', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const activity: GenerationActivity[] = []

    const first = await service.createDesign('A calm analytics dashboard', (event) => activity.push(event))
    const second = await service.generate(first.id, 'Use a warmer editorial direction', (event) => activity.push(event))

    expect(first.revisions).toHaveLength(1)
    expect(second.revisions).toHaveLength(2)
    expect(second.revisions[1].parentRevisionId).toBe(first.activeRevisionId)
    const secondFiles = service.getRevisionFiles(second.id, second.revisions[1].id)
    expect(secondFiles['index.html']).toContain('.build/tailwind.css')
    expect(secondFiles['.build/tailwind.css'].length).toBeGreaterThan(0)
    expect(second.revisions[0].gitCommit).toMatch(/^[0-9a-f]{40}$/)
    expect(second.revisions[1].gitCommit).toMatch(/^[0-9a-f]{40}$/)
    const repositoryPath = path.join(directory, 'designs', first.id, 'repository')
    expect(existsSync(path.join(repositoryPath, '.git'))).toBe(true)
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim()).toBe('3')
    expect(activity.map((event) => event.stage)).toEqual([
      'queued', 'generating', 'compiling', 'validating', 'saving', 'complete',
      'generating', 'compiling', 'validating', 'saving', 'complete',
    ])
    store.close()
  })

  it('retains invalid candidates without replacing the last valid revision', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)
    const failed = await service.generate(first.id, 'Reference a local file', () => undefined, '<html><body><img src="file:///C:/secret.png"></body></html>')

    expect(failed.activeRevisionId).toBe(first.activeRevisionId)
    expect(failed.revisions).toHaveLength(1)
    expect(failed.invalidCandidates).toMatchObject([{ prompt: 'Reference a local file', diagnostic: expect.stringMatching(/file:/) }])
    expect(failed.invalidCandidates[0].html).toContain('file:')
    store.close()
  })

  it('repairs an invalid candidate before replacing the active revision when repair is enabled', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)
    const activity: GenerationActivity[] = []

    const repaired = await service.generate(
      first.id,
      'Reference a local file',
      (event) => activity.push(event),
      '<html><body><img src="file:///C:/secret.png"></body></html>',
      true,
      undefined,
      3,
    )

    expect(repaired.revisions).toHaveLength(2)
    expect(repaired.invalidCandidates).toHaveLength(0)
    expect(activity.map((event) => event.stage)).toContain('repairing')
    const repairedFiles = service.getRevisionFiles(repaired.id, repaired.revisions.at(-1)!.id)
    expect(repairedFiles['index.html']).not.toContain('file:///')
    store.close()
  })

  it('records the Git commit created by a non-destructive restoration', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)
    const second = await service.generate(first.id, 'Use a warmer editorial direction', () => undefined)

    const restored = service.restoreRevision(second.id, first.activeRevisionId!)

    expect(restored.revisions).toHaveLength(3)
    expect(restored.revisions.at(-1)?.gitCommit).toMatch(/^[0-9a-f]{40}$/)
    // The restored head reproduces the first revision's committed content.
    const firstFiles = service.getRevisionFiles(first.id, first.activeRevisionId!)
    const restoredFiles = service.getRevisionFiles(restored.id, restored.revisions.at(-1)!.id)
    expect(restoredFiles['index.html']).toBe(firstFiles['index.html'])
    expect(restoredFiles['.build/tailwind.css']).toBe(firstFiles['.build/tailwind.css'])
    store.close()
  })

  it('checks out the working tree when going back to a revision and restores forward as a new commit', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm dashboard', () => undefined)
    const entryPath = path.join(directory, 'designs', first.id, 'repository', 'index.html')
    const firstHtml = readFileSync(entryPath, 'utf8')
    const second = await service.generate(first.id, 'A warmer editorial direction', () => undefined)
    const secondHtml = readFileSync(entryPath, 'utf8')
    expect(firstHtml).not.toBe(secondHtml)

    // Going back to an earlier revision checks its commit out into the working tree.
    service.selectRevision(first.id, first.activeRevisionId!)
    expect(readFileSync(entryPath, 'utf8')).toBe(firstHtml)

    // Selecting the head returns the working tree to the latest revision.
    service.selectRevision(first.id, second.activeRevisionId!)
    expect(readFileSync(entryPath, 'utf8')).toBe(secondHtml)

    // Restore creates a new head commit reproducing the earlier revision without dropping later ones.
    const restored = service.restoreRevision(first.id, first.activeRevisionId!)
    expect(restored.revisions).toHaveLength(3)
    expect(readFileSync(entryPath, 'utf8')).toBe(firstHtml)
    store.close()
  })

  it('preserves an agent response without creating a design revision', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)

    const responded = service.recordAgentResponse(first.id, 'I can explain the layout without changing it.')

    expect(responded.revisions).toHaveLength(1)
    expect(responded.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'I can explain the layout without changing it.' })
    store.close()
  })

  it("prepares an empty managed workspace before an agent's initial prompt is queued", () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)

    const design = service.createAgentDesignShell('A calm analytics dashboard', () => undefined)

    expect(design.revisions).toHaveLength(0)
    expect(design.messages).toHaveLength(0)
    expect(existsSync(path.join(directory, 'designs', design.id, 'repository', '.git'))).toBe(true)
    store.close()
  })

  it('validates and saves a changed agent workspace while retaining its conversational response', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)
    const repositoryPath = path.join(directory, 'designs', first.id, 'repository')
    writeFileSync(repositoryPath + path.sep + 'index.html', '<!doctype html><html><head><title>Agent result</title></head><body><main><h1>Updated</h1></main></body></html>', 'utf8')

    const saved = await service.saveAgentWorkspaceResult(first.id, 'Make it clearer', 'codex', 'model-1', 'I clarified the hierarchy.', () => undefined)

    expect(saved.revisions).toHaveLength(2)
    expect(saved.revisions.at(-1)).toMatchObject({ providerId: 'codex', modelId: 'model-1', gitCommit: expect.stringMatching(/^[0-9a-f]{40}$/) })
    expect(saved.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'I clarified the hierarchy.' })
    store.close()
  })

  it('preserves a response-only turn when the agent workspace Git head is unchanged', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-service-'))
    directories.push(directory)
    const store = new WorkspaceStore(directory)
    const service = new WorkspaceService(store)
    const first = await service.createDesign('A calm analytics dashboard', () => undefined)

    const saved = await service.saveAgentWorkspaceResult(first.id, 'Explain the layout', 'codex', 'model-1', 'The hierarchy prioritizes the summary.', () => undefined)

    expect(saved.revisions).toHaveLength(1)
    expect(saved.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'The hierarchy prioritizes the summary.' })
    store.close()
  })
})
