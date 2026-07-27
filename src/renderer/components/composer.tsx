import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button, Header, Input, Menu, MenuItem, MenuSection, Slider, SliderThumb, SliderTrack, TextArea, TextField } from 'react-aria-components'
import { ArrowPathIcon, ArrowRightIcon, CheckCircleIcon, CommandLineIcon, DocumentDuplicateIcon, ExclamationTriangleIcon, FolderIcon } from '@heroicons/react/24/outline'
import { AppModal } from './AppModal'
import { DropdownButton } from './DropdownButton'
import { AttachmentPicker, type AttachmentPickerKind } from './common'

export type ProviderId = 'mock' | 'codex' | 'claude'

export function GenerationSettingsMenu({ providers, providerId, modelId, effort, onChange }: {
  readonly providers: readonly ProviderStatus[]
  readonly providerId: ProviderId
  readonly modelId: string
  readonly effort: string | null
  readonly onChange: (selection: { providerId: ProviderId; modelId: string; effort: string | null }) => void
}) {
  const available = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const provider = available.find((candidate) => candidate.id === providerId)
  const model = provider?.models.find((candidate) => candidate.id === modelId) ?? provider?.models[0]
  const efforts = model?.effortLevels ?? []
  const defaultEffort = (levels: readonly ProviderEffortLevel[]) => levels.find((candidate) => candidate.isDefault)?.id ?? levels[0]?.id ?? null
  const effortForModel = (levels: readonly ProviderEffortLevel[]) => effort && levels.some((candidate) => candidate.id === effort) ? effort : defaultEffort(levels)
  const activeEffort = effort ?? defaultEffort(efforts)
  const effortIndex = Math.max(0, efforts.findIndex((candidate) => candidate.id === activeEffort))
  const selectProvider = (nextProviderId: ProviderId) => {
    const nextProvider = available.find((candidate) => candidate.id === nextProviderId)
    const nextModel = nextProvider?.models[0]
    onChange({ providerId: nextProviderId, modelId: nextModel?.id ?? 'mock-v1', effort: defaultEffort(nextModel?.effortLevels ?? []) })
  }

  return (
    <DropdownButton
      label="Generation settings"
      triggerClassName="generation-settings-button"
      popoverClassName="generation-settings-popover"
      placement="top"
      isDisabled={!available.length}
      trigger={<><CommandLineIcon aria-hidden="true" /><span>{provider ? `${provider.name} · ${model?.name ?? 'Choose model'}` : 'No provider available'}</span></>}
    >
        <div className="generation-settings-columns">
          <section className="generation-settings-column"><h2>Provider</h2><Menu aria-label="Provider" className="generation-settings-menu" shouldCloseOnSelect={false}>
            {available.map((candidate) => <MenuItem id={candidate.id} key={candidate.id} onAction={() => selectProvider(candidate.id)}><span>{candidate.name}</span>{providerId === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
          </Menu></section>
          <section className="generation-settings-column"><h2>Model</h2><Menu aria-label="Model" className="generation-settings-menu" shouldCloseOnSelect={false}>
            {(provider?.models ?? []).map((candidate) => <MenuItem id={`model-${candidate.id}`} key={candidate.id} onAction={() => onChange({ providerId, modelId: candidate.id, effort: effortForModel(candidate.effortLevels) })}><span>{candidate.name}</span>{model?.id === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
            {!provider && <MenuItem id="no-model" isDisabled>No models available</MenuItem>}
          </Menu></section>
          <section className="generation-settings-column effort-control" data-disabled={!efforts.length || undefined}>
            <h2>Effort</h2><span>{efforts[effortIndex]?.name ?? 'Not supported by this model'}</span>
            <div className="effort-vertical-control">
              <Slider aria-label="Reasoning effort" orientation="vertical" className="effort-slider" minValue={0} maxValue={Math.max(0, efforts.length - 1)} step={1} value={effortIndex} isDisabled={!efforts.length} onChange={(value) => onChange({ providerId, modelId: model?.id ?? 'mock-v1', effort: efforts[Number(value)]?.id ?? null })}>
                <SliderTrack className="effort-slider-track">
                  <span className="effort-rail" aria-hidden="true" />
                  <span className="effort-nodes" aria-hidden="true">{efforts.map((candidate, index) => <span className="effort-node" data-active={index === effortIndex || undefined} key={candidate.id} />)}</span>
                  <SliderThumb className="effort-slider-thumb" />
                </SliderTrack>
              </Slider>
              {efforts.length > 1 && <div className="effort-labels"><span>{efforts.at(-1)?.name}</span><span>{efforts[0]?.name}</span></div>}
            </div>
          </section>
        </div>
    </DropdownButton>
  )
}

export function ProjectSelectionMenu({ projects, includeStandalone = true, onAction }: {
  readonly projects: readonly ProjectSummary[]
  readonly includeStandalone?: boolean
  readonly onAction: (key: string) => void
}) {
  const linkedProjects = projects.filter((project) => project.kind === 'linked')
  return (
    <Menu aria-label="Design project" onAction={(key) => onAction(String(key))}>
      {includeStandalone && <MenuItem id="standalone">Standalone design</MenuItem>}
      <MenuItem id="folder">Choose local project folder…</MenuItem>
      <MenuItem id="clone">Clone Git repository…</MenuItem>
      {linkedProjects.length > 0 && <MenuSection className="project-popover-section">
        <Header className="project-popover-header">Add to a project</Header>
        {linkedProjects.map((project) => <MenuItem id={`project:${project.id}`} key={project.id}>{project.name}</MenuItem>)}
      </MenuSection>}
    </Menu>
  )
}

export function NewDesignComposer({ providers, busy, fixedProject, projects = [], initialProject = null, onCreate, onOpenProviders }: {
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly fixedProject?: ProjectSummary
  readonly projects?: readonly ProjectSummary[]
  readonly initialProject?: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => Promise<void>
  readonly onOpenProviders: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const [selection, setSelection] = useState<GenerationSelection>({ providerId: 'mock', modelId: 'mock-v1', effort: null })
  const [sourceProjectPath, setSourceProjectPath] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(initialProject)
  const [cloneTarget, setCloneTarget] = useState<{ remoteUrl: string; destinationDirectory: string } | null>(null)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneRemoteUrl, setCloneRemoteUrl] = useState('')
  const [cloneDestinationDirectory, setCloneDestinationDirectory] = useState('')
  const [attachments, setAttachments] = useState<readonly DesignAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const hasUsableSelection = readyProviders.some((provider) => provider.id === selection.providerId && provider.models.some((model) => model.id === selection.modelId))
  useEffect(() => {
    const pending = window.omnidesign?.settings.getGenerationDefaults?.()
    if (!pending) return
    void pending.then((saved) => { if (saved) setSelection(saved) }).catch((reason: unknown) => setError(`Generation defaults could not be loaded. ${reason instanceof Error ? reason.message : ''}`.trim()))
  }, [])
  useEffect(() => {
    const selectedProvider = readyProviders.find((provider) => provider.id === selection.providerId)
    if (selectedProvider?.models.some((model) => model.id === selection.modelId)) return
    const provider = readyProviders[0]
    const model = provider?.models[0]
    if (!provider || !model) return
    const effort = model.effortLevels.find((candidate) => candidate.isDefault)?.id ?? model.effortLevels[0]?.id ?? null
    setSelection({ providerId: provider.id, modelId: model.id, effort })
  }, [readyProviders, selection.modelId, selection.providerId])
  // Pre-fill the target when a project's "+" launched this composer.
  useEffect(() => {
    if (!initialProject) return
    setSelectedProject(initialProject)
    setSourceProjectPath(null)
    setCloneTarget(null)
  }, [initialProject])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    void window.omnidesign?.settings.saveGenerationDefaults?.(next).catch((reason: unknown) => setError(`Generation defaults could not be saved. ${reason instanceof Error ? reason.message : ''}`.trim()))
  }
  const target = (): CreateDesignTarget | null => {
    if (fixedProject) return { projectId: fixedProject.id }
    if (cloneTarget) return { cloneRemoteUrl: cloneTarget.remoteUrl, cloneDestinationDirectory: cloneTarget.destinationDirectory }
    if (selectedProject) return { projectId: selectedProject.id }
    return sourceProjectPath ? { sourceProjectPath } : null
  }
  const projectLabel = cloneTarget
    ? `Clone into ${cloneTarget.destinationDirectory.split(/[\\/]/).filter(Boolean).at(-1)}`
    : selectedProject ? selectedProject.name : sourceProjectPath ? sourceProjectPath.split(/[\\/]/).filter(Boolean).at(-1) : 'Standalone design'
  const chooseTarget = (key: string) => {
    if (key === 'standalone') { setSelectedProject(null); setSourceProjectPath(null); setCloneTarget(null); return }
    if (key === 'folder') {
      setSelectedProject(null)
      setCloneTarget(null)
      setError(null)
      void window.omnidesign?.workspace.chooseProjectFolder().then((folderPath) => {
        if (folderPath) { setSourceProjectPath(folderPath); setSelectedProject(null) }
      }).catch((reason: unknown) => setError(`The project folder could not be selected. ${reason instanceof Error ? reason.message : ''}`.trim()))
      return
    }
    if (key === 'clone') { setCloneModalOpen(true); return }
    if (key.startsWith('project:')) {
      const project = projects.find((candidate) => candidate.id === key.slice('project:'.length))
      if (project) { setSelectedProject(project); setSourceProjectPath(null); setCloneTarget(null) }
    }
  }
  const chooseCloneDestination = async () => {
    setError(null)
    try {
      const directory = await window.omnidesign?.workspace.chooseProjectFolder()
      if (directory) setCloneDestinationDirectory(directory)
    } catch (reason) {
      setError(`The clone destination could not be selected. ${reason instanceof Error ? reason.message : ''}`.trim())
    }
  }
  const confirmCloneTarget = () => {
    if (!cloneRemoteUrl.trim() || !cloneDestinationDirectory) return
    setCloneTarget({ remoteUrl: cloneRemoteUrl.trim(), destinationDirectory: cloneDestinationDirectory })
    setSelectedProject(null)
    setSourceProjectPath(null)
    setCloneModalOpen(false)
  }
  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy || !hasUsableSelection) return
    setError(null)
    try {
      await onCreate(value, selection.providerId, selection.modelId, selection.effort, target(), attachments)
      setPrompt('')
      setAttachments([])
    } catch (reason) {
      setError(`The design could not be created. ${reason instanceof Error && reason.message ? reason.message : 'Please review the selected project and provider, then try again.'}`)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
      event.preventDefault()
      void submit()
    }
  }
  const chooseAttachments = async (kind: AttachmentPickerKind) => {
    setError(null)
    try {
      const selected = await window.omnidesign?.workspace.chooseAttachments(kind)
      if (selected?.length) setAttachments((current) => [...current, ...selected.filter((attachment) => !current.some((existing) => existing.path === attachment.path))])
    } catch (reason) {
      setError(`References could not be attached. ${reason instanceof Error ? reason.message : ''}`.trim())
    }
  }

  return (
    <section className="new-design-composer" aria-label="Create a design">
      <TextField className="prompt-field" aria-label="What would you like to design?">
        <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onKeyDown} placeholder="What would you like to design?" />
      </TextField>
      {attachments.length > 0 && <div className="attachment-list" aria-label="Attached references">{attachments.map((attachment) => <span className="attachment-chip" data-status={attachment.status} key={attachment.id}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}<Button aria-label={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))}>×</Button></span>)}</div>}
      <div className="composer-footer">
        <div className="composer-leading">
          <AttachmentPicker onChoose={(kind) => void chooseAttachments(kind)} />
          {fixedProject
            ? <span className="project-context project-context-fixed">{fixedProject.kind === 'linked' ? <FolderIcon aria-hidden="true" /> : <DocumentDuplicateIcon aria-hidden="true" />}{fixedProject.name}</span>
            : <DropdownButton triggerClassName="project-context" popoverClassName="project-popover" placement="top" trigger={<><FolderIcon aria-hidden="true" />{projectLabel}</>}>
                <ProjectSelectionMenu projects={projects} onAction={chooseTarget} />
              </DropdownButton>}
        </div>
        <GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} />
        <Button className="submit-prompt" aria-label="Create design" isDisabled={!prompt.trim() || busy || !hasUsableSelection} onPress={() => void submit()}>
          {busy ? <ArrowPathIcon className="spin" aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </div>
      {!readyProviders.length && <div className="no-provider-notice" role="status"><ExclamationTriangleIcon aria-hidden="true" /><span><strong>Connect a provider to start generating.</strong><small>You can still open projects and review or export existing designs.</small></span><Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button></div>}
      {error && <p className="generation-recovery" role="alert">{error}</p>}
      <AppModal isOpen={cloneModalOpen} onOpenChange={setCloneModalOpen} className="clone-modal" title="Clone Git repository">
        {(close) => <>
              <p>OmniDesign will create a new repository folder inside the destination you choose. Nothing is cloned until you submit this design prompt.</p>
              <div className="clone-modal-fields">
                <TextField aria-label="Git repository URL"><Input value={cloneRemoteUrl} onChange={(event) => setCloneRemoteUrl(event.target.value)} placeholder="git@github.com:team/project.git" /></TextField>
                <div className="clone-destination"><TextField aria-label="Destination folder"><Input value={cloneDestinationDirectory} onChange={(event) => setCloneDestinationDirectory(event.target.value)} placeholder="Destination folder" /></TextField><Button className="secondary-action" onPress={() => void chooseCloneDestination()}>Choose folder</Button></div>
              </div>
              <p className="clone-modal-note">For example, <code>project.git</code> will be cloned to a new <code>project</code> folder inside the destination.</p>
              <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!cloneRemoteUrl.trim() || !cloneDestinationDirectory} onPress={confirmCloneTarget}>Use repository</Button></div>
            </>}
      </AppModal>
    </section>
  )
}
