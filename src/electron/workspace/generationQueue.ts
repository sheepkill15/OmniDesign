import type { Attachment, GenerationActivity, GenerationJob } from './contracts.js'
import { WorkspaceStore } from './store.js'

type ActivityListener = (activity: GenerationActivity) => void
type JobRunner = (job: GenerationJob, signal: AbortSignal, onActivity: ActivityListener) => Promise<void>

export class GenerationQueue {
  private readonly runningDesignIds = new Set<string>()
  private readonly abortControllers = new Map<string, AbortController>()
  private readonly pausedDesignIds = new Set<string>()
  private runningCount = 0
  private draining = false

  public constructor(
    private readonly store: WorkspaceStore,
    private readonly runJob: JobRunner,
    private readonly onActivity: ActivityListener,
    private readonly concurrency = 2,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Generation queue concurrency must be at least one.')
  }

  public enqueue(designId: string, prompt: string, providerId: 'mock' | 'codex' | 'claude' = 'mock', modelId = 'mock-v1', effort?: string | null, attachments: readonly Attachment[] = []): GenerationJob {
    const job = this.store.enqueueGenerationJob(designId, prompt, providerId, modelId, effort, attachments)
    this.onActivity({ designId, stage: 'queued', detail: 'Generation is queued.' })
    void this.drain()
    return job
  }

  public recoverAfterRestart(): GenerationJob[] {
    for (const designId of this.store.listPausedGenerationDesignIds()) this.pausedDesignIds.add(designId)
    return this.store.markGenerationJobsInterrupted()
  }

  public cancel(jobId: string): GenerationJob {
    const job = this.store.getGenerationJob(jobId)
    if (!job) throw new Error('Generation job not found.')
    if (job.state === 'queued') {
      const cancelled = this.store.cancelQueuedGenerationJob(jobId)
      this.pauseDesign(cancelled.designId)
      this.onActivity({ designId: cancelled.designId, stage: 'cancelled', detail: 'Queued generation was cancelled.' })
      void this.drain()
      return cancelled
    }
    if (job.state !== 'running') throw new Error('Generation job is not active.')
    this.abortControllers.get(jobId)?.abort()
    this.onActivity({ designId: job.designId, stage: 'generating', detail: 'Stopping generation…' })
    return job
  }

  public retry(jobId: string): GenerationJob {
    const job = this.store.retryGenerationJob(jobId)
    this.pausedDesignIds.delete(job.designId)
    this.store.resumeGenerationQueue(job.designId)
    this.onActivity({ designId: job.designId, stage: 'queued', detail: 'Generation retry is queued.' })
    void this.drain()
    return job
  }

  public continue(jobId: string): GenerationJob {
    const job = this.store.continueGenerationJob(jobId)
    this.pausedDesignIds.delete(job.designId)
    this.store.resumeGenerationQueue(job.designId)
    this.onActivity({ designId: job.designId, stage: 'queued', detail: 'Continuing from the retained partial workspace.' })
    void this.drain()
    return job
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.runningCount < this.concurrency) {
        const job = this.store.listGenerationJobs().find((candidate) => !this.runningDesignIds.has(candidate.designId) && !this.pausedDesignIds.has(candidate.designId))
        if (!job) return
        this.start(job)
      }
    } finally {
      this.draining = false
    }
  }

  private start(job: GenerationJob): void {
    this.runningCount += 1
    this.runningDesignIds.add(job.designId)
    const abortController = new AbortController()
    this.abortControllers.set(job.id, abortController)
    void this.execute(job, abortController.signal)
  }

  private async execute(job: GenerationJob, signal: AbortSignal): Promise<void> {
    let pauseQueue = false
    try {
      this.store.setGenerationJobState(job.id, 'running')
      let failed = false
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await this.runJob(job, signal, (activity) => {
            failed ||= activity.stage === 'failed'
            this.onActivity(activity)
          })
          break
        } catch (error) {
          if (signal.aborted || !isTransientProviderError(error) || attempt === 2) throw error
          this.onActivity({ designId: job.designId, stage: 'generating', detail: `Provider connection failed. Retrying (${attempt + 2} of 3)…` })
        }
      }
      pauseQueue = signal.aborted || failed
      this.store.setGenerationJobState(job.id, signal.aborted ? 'cancelled' : failed ? 'failed' : 'completed', signal.aborted ? 'Cancelled by the user.' : failed ? 'Generation did not produce a valid revision.' : null)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Generation failed.'
      const stage = signal.aborted ? 'cancelled' : 'failed'
      pauseQueue = true
      this.store.setGenerationJobState(job.id, stage, signal.aborted ? 'Cancelled by the user.' : detail)
      this.onActivity({ designId: job.designId, stage, detail: signal.aborted ? 'Generation was cancelled.' : detail })
    } finally {
      if (pauseQueue) this.pauseDesign(job.designId)
      this.abortControllers.delete(job.id)
      this.runningCount -= 1
      this.runningDesignIds.delete(job.designId)
      void this.drain()
    }
  }

  private pauseDesign(designId: string): void {
    this.pausedDesignIds.add(designId)
    this.store.pauseGenerationQueue(designId)
  }
}

export function isTransientProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\b(timeout|timed out|network|transport|connection|econn|socket|rate limit|429|502|503|504|temporar)/i.test(message)
}
