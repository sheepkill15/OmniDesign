import { useState } from 'react'
import { Button } from 'react-aria-components'
import { StopIcon } from '@heroicons/react/24/outline'
import { GenerationElapsed } from '../components/GenerationElapsed'
import { GenerationActivitySection, terminalGenerationStages } from '../components/common'

export function Generations({ designs, onOpen, onCancel, onRemove, onResume }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly onOpen: (design: OmniDesignDocument) => void
  readonly onCancel: (jobId: string) => Promise<void>
  readonly onRemove: (jobId: string) => Promise<void>
  readonly onResume: (designId: string) => Promise<void>
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobs = designs.flatMap((design) => design.generationJobs
    .filter((job) => ['queued', 'running'].includes(job.state))
    .map((job) => ({ design, job })))
  const runningCount = jobs.filter(({ job }) => job.state === 'running').length
  const queuedCount = jobs.length - runningCount
  const summary = [runningCount ? `${runningCount} running` : '', queuedCount ? `${queuedCount} queued` : ''].filter(Boolean).join(' · ')
  const runAction = async (id: string, action: () => Promise<void>, failure: string) => {
    setPendingAction(id)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(`${failure}${reason instanceof Error && reason.message ? ` ${reason.message}` : ''}`)
    } finally {
      setPendingAction(null)
    }
  }
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Generations</h1><p>Work continues while you move between designs. Each design runs one prompt at a time.</p></header>
        <section className="settings-section" aria-labelledby="active-generations-heading">
          <div className="section-heading"><h2 id="active-generations-heading">Active work</h2><span>{jobs.length ? summary : 'All caught up'}</span></div>
          {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Generation action failed.</strong><small>{error}</small></span><Button className="text-button" onPress={() => setError(null)}>Dismiss</Button></div>}
          <div className="generation-list">
            {jobs.map(({ design, job }) => {
              const progress = job.startedAt
                ? design.generationSteps.filter((step) => step.createdAt >= job.startedAt! && !terminalGenerationStages.includes(step.stage)).slice(-8)
                : []
              const stage = design.queuePaused ? 'Queue paused' : job.state === 'queued' ? 'Queued' : progress.at(-1)?.label ?? 'Starting'
              return <article className="generation-row" key={job.id}>
                <Button aria-label={`${design.projectName}, ${design.title}: ${stage}`} className="generation-copy" onPress={() => onOpen(design)}><span className="generation-heading"><strong>{design.title}</strong><em>{design.projectName}</em></span><small>{stage} · {job.providerId === 'mock' ? 'Development provider' : `${job.providerId} · ${job.modelId}`} · {job.prompt}</small></Button>
                <GenerationElapsed startedAt={job.startedAt ?? job.createdAt} />
                {job.state === 'queued'
                  ? design.queuePaused && design.generationJobs.find((candidate) => candidate.state === 'queued')?.id === job.id
                    ? <span className="generation-actions"><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`resume:${design.id}`, () => onResume(design.id), 'The paused queue could not be resumed.')}>{pendingAction === `resume:${design.id}` ? 'Resuming…' : 'Resume'}</Button><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`remove:${job.id}`, () => onRemove(job.id), 'The queued prompt could not be removed.')}>{pendingAction === `remove:${job.id}` ? 'Removing…' : 'Remove'}</Button></span>
                    : <Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`remove:${job.id}`, () => onRemove(job.id), 'The queued prompt could not be removed.')}>{pendingAction === `remove:${job.id}` ? 'Removing…' : 'Remove'}</Button>
                  : <Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`stop:${job.id}`, () => onCancel(job.id), 'The running generation could not be stopped.')}><StopIcon aria-hidden="true" />{pendingAction === `stop:${job.id}` ? 'Stopping…' : 'Stop'}</Button>}
                {progress.length ? <GenerationActivitySection className="active-generation-activity" id={`${job.id}-progress`} steps={progress} title="Progress details" /> : null}
              </article>
            })}
            {!jobs.length && <p className="settings-empty">No generations are queued or running.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}
