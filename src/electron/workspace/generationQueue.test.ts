import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerationJob } from './contracts.js'
import { GenerationQueue } from './generationQueue.js'
import { WorkspaceStore } from './store.js'

const directories: string[] = []

function createStore(): WorkspaceStore {
  const directory = mkdtempSync(path.join(tmpdir(), 'omnidesign-queue-'))
  directories.push(directory)
  return new WorkspaceStore(directory)
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined
  const promise = new Promise<void>((complete) => { resolve = complete })
  return { promise, resolve }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('Timed out waiting for queued work.')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('GenerationQueue', () => {
  it('runs one job at a time for a design while allowing separate designs to run concurrently', async () => {
    const store = createStore()
    const firstDesign = store.createStandaloneDesign('First', 'First design')
    const secondDesign = store.createStandaloneDesign('Second', 'Second design')
    const work = new Map<string, ReturnType<typeof deferred>>()
    const started: string[] = []
    const queue = new GenerationQueue(store, async (job: GenerationJob) => {
      started.push(job.id)
      const pending = deferred()
      work.set(job.id, pending)
      await pending.promise
    }, () => undefined, 2)

    const first = queue.enqueue(firstDesign.id, 'First change')
    const second = queue.enqueue(firstDesign.id, 'Second change')
    const third = queue.enqueue(secondDesign.id, 'Other design change')
    await waitFor(() => started.length === 2)

    expect(started).toEqual(expect.arrayContaining([first.id, third.id]))
    expect(started).not.toContain(second.id)
    expect(store.listGenerationJobs(['running']).map((job) => job.id)).toEqual(expect.arrayContaining([first.id, third.id]))

    work.get(first.id)?.resolve()
    await waitFor(() => started.includes(second.id))
    expect(store.listGenerationJobs(['completed']).map((job) => job.id)).toContain(first.id)
    work.get(second.id)?.resolve()
    work.get(third.id)?.resolve()
    await waitFor(() => store.listGenerationJobs(['completed']).length === 3)
    store.close()
  })

  it('marks queued and running jobs interrupted when the application closes or restarts', () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const queued = store.enqueueGenerationJob(design.id, 'Queued prompt')
    const running = store.enqueueGenerationJob(design.id, 'Running prompt')
    store.setGenerationJobState(running.id, 'running')
    const queue = new GenerationQueue(store, vi.fn(), () => undefined)

    expect(queue.recoverAfterRestart()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: queued.id, state: 'interrupted' }),
      expect.objectContaining({ id: running.id, state: 'interrupted' }),
    ]))
    store.close()
  })
})
