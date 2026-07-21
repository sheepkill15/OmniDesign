import type { GenerationActivity, GenerationJob } from './contracts.js'
import { WorkspaceStore } from './store.js'

type ActivityListener = (activity: GenerationActivity) => void
type JobRunner = (job: GenerationJob, onActivity: ActivityListener) => Promise<void>

export class GenerationQueue {
  private readonly runningDesignIds = new Set<string>()
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

  public enqueue(designId: string, prompt: string): GenerationJob {
    const job = this.store.enqueueGenerationJob(designId, prompt)
    this.onActivity({ designId, stage: 'queued', detail: 'Generation is queued.' })
    void this.drain()
    return job
  }

  public recoverAfterRestart(): GenerationJob[] {
    return this.store.markGenerationJobsInterrupted()
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.runningCount < this.concurrency) {
        const job = this.store.listGenerationJobs().find((candidate) => !this.runningDesignIds.has(candidate.designId))
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
    void this.execute(job)
  }

  private async execute(job: GenerationJob): Promise<void> {
    try {
      this.store.setGenerationJobState(job.id, 'running')
      let failed = false
      await this.runJob(job, (activity) => {
        failed ||= activity.stage === 'failed'
        this.onActivity(activity)
      })
      this.store.setGenerationJobState(job.id, failed ? 'failed' : 'completed', failed ? 'Generation did not produce a valid revision.' : null)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Generation failed.'
      this.store.setGenerationJobState(job.id, 'failed', detail)
      this.onActivity({ designId: job.designId, stage: 'failed', detail })
    } finally {
      this.runningCount -= 1
      this.runningDesignIds.delete(job.designId)
      void this.drain()
    }
  }
}
