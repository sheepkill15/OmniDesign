import { Button } from 'react-aria-components'
import { ArrowPathIcon, ArrowRightIcon, BoltIcon, ClockIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { NewDesignComposer, type ProviderId } from '../components/composer'
import { ProjectThumbnail, designSubtitle } from '../components/common'

export function Home({ projects, designs, providers, providersLoading, busy, activity, composerProject, onCreate, onOpenDesign, onOpenProviders }: {
  readonly projects: readonly ProjectSummary[]
  readonly designs: readonly OmniDesignDocument[]
  readonly providers: readonly ProviderStatus[]
  readonly providersLoading: boolean
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly composerProject: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => Promise<void>
  readonly onOpenDesign: (design: OmniDesignDocument) => void
  readonly onOpenProviders: () => void
}) {
  // Recent entries are the most recently active designs; opening one goes straight to its workspace.
  const recentDesigns = [...designs].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)).slice(0, 3)
  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading"><h1>Start with an idea.</h1><p>Turn it into something you can see, use, and refine—without leaving your local workspace.</p></header>
        <NewDesignComposer providers={providers} providersLoading={providersLoading} busy={busy} projects={projects} initialProject={composerProject} onCreate={onCreate} onOpenProviders={onOpenProviders} />
        {busy
          ? <div className="generation-notice" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity?.detail ?? 'Setting up design repository…'}</strong></span></div>
          : activity && <div className="generation-notice" role="status"><BoltIcon aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span></div>}
        <section className="recent-section" aria-labelledby="recent-designs">
          <div className="section-heading"><h2 id="recent-designs">Continue designing</h2><span>{designs.length ? `${designs.length} design${designs.length === 1 ? '' : 's'}` : 'Nothing here yet'}</span></div>
          <div className="recent-rows">
            {recentDesigns.map((design) => (
              <Button className="recent-row" key={design.id} onPress={() => onOpenDesign(design)}>
                <ProjectThumbnail title={design.title} thumbnailDataUrl={design.thumbnailDataUrl} />
                <span className="recent-copy"><strong>{design.title}</strong><small>{designSubtitle(design)}</small></span>
                <span className="recent-time"><ClockIcon aria-hidden="true" />{new Date(design.updatedAt).toLocaleDateString()}</span>
                <ArrowRightIcon className="row-arrow" aria-hidden="true" />
              </Button>
            ))}
            {!designs.length && <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>Your first design starts above</strong><p>A connected provider will generate, compile, validate, and save it locally.</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}
