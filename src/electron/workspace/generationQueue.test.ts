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
    await new Promise((resolve) => setTimeout(resolve, 0))
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

  it('persists provider and model selection through queueing and retry', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const queue = new GenerationQueue(store, async () => { throw new Error('Unavailable') }, () => undefined)
    const queued = queue.enqueue(design.id, 'Refine this', 'codex', 'gpt-5.6', 'high')

    await waitFor(() => store.getGenerationJob(queued.id)?.state === 'failed')
    const retried = queue.retry(queued.id)
    expect(retried).toMatchObject({ providerId: 'codex', modelId: 'gpt-5.6', effort: 'high' })
    await waitFor(() => store.getGenerationJob(retried.id)?.state === 'failed')
    store.close()
  })

  it('automatically retries transient provider failures up to three attempts', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    let attempts = 0
    const activity: string[] = []
    const queue = new GenerationQueue(store, async () => {
      attempts += 1
      if (attempts < 3) throw new Error('Network connection timed out.')
    }, (event) => activity.push(event.detail))
    const job = queue.enqueue(design.id, 'Refine this', 'codex', 'gpt-5.6')

    await waitFor(() => store.getGenerationJob(job.id)?.state === 'completed')
    expect(attempts).toBe(3)
    expect(activity).toEqual(expect.arrayContaining(['Provider connection failed. Retrying (2 of 3)…', 'Provider connection failed. Retrying (3 of 3)…']))
    store.close()
  })

  it('does not retry non-transient provider failures', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const runner = vi.fn(async () => { throw new Error('Model is not available.') })
    const queue = new GenerationQueue(store, runner, () => undefined)
    const job = queue.enqueue(design.id, 'Refine this', 'codex', 'gpt-5.6')

    await waitFor(() => store.getGenerationJob(job.id)?.state === 'failed')
    expect(runner).toHaveBeenCalledTimes(1)
    store.close()
  })

  it('cancels queued work and retries interrupted work as a new queued job', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const queue = new GenerationQueue(store, vi.fn(), () => undefined)
    const queued = store.enqueueGenerationJob(design.id, 'Queued prompt')

    expect(queue.cancel(queued.id)).toMatchObject({ id: queued.id, state: 'cancelled' })
    const retried = queue.retry(queued.id)
    expect(retried).toMatchObject({ designId: design.id, prompt: 'Queued prompt', state: 'queued' })
    expect(retried.id).not.toBe(queued.id)
    await waitFor(() => store.getGenerationJob(retried.id)?.state === 'completed')
    store.close()
  })

  it('aborts active work and records it as cancelled', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const pending = deferred()
    let signal: AbortSignal | undefined
    const queue = new GenerationQueue(store, async (_job, currentSignal) => {
      signal = currentSignal
      await pending.promise
    }, () => undefined)
    const job = queue.enqueue(design.id, 'Active prompt')

    await waitFor(() => signal !== undefined)
    queue.cancel(job.id)
    expect(signal?.aborted).toBe(true)
    pending.resolve()
    await waitFor(() => store.getGenerationJob(job.id)?.state === 'cancelled')
    store.close()
  })

  it('pauses later prompts for a design after a failed predecessor', async () => {
    const store = createStore()
    const design = store.createStandaloneDesign('First', 'Design')
    const queue = new GenerationQueue(store, async () => { throw new Error('Provider unavailable.') }, () => undefined, 1)
    const first = queue.enqueue(design.id, 'First prompt')
    const second = queue.enqueue(design.id, 'Second prompt')

    await waitFor(() => store.getGenerationJob(first.id)?.state === 'failed')
    expect(store.getGenerationJob(second.id)).toMatchObject({ state: 'queued' })
    expect(store.getDesign(design.id)?.queuePaused).toBe(true)
    store.close()
  })
})
