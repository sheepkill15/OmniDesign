import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Header, Input, Menu, MenuItem, MenuSection, TextArea, TextField } from 'react-aria-components'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  InformationCircleIcon,
  SparklesIcon,
  Squares2X2Icon,
  StopIcon,
  SwatchIcon,
  TrashIcon,
  ViewColumnsIcon,
  WindowIcon,
} from '@heroicons/react/24/outline'
import { AppModal } from '../components/AppModal'
import { DropdownButton } from '../components/DropdownButton'
import { Markdown } from '../components/Markdown'
import { DesignPreview } from './DesignPreview'
import { AttachmentPicker, EditableTitle, GenerationActivitySection, IconButton, terminalGenerationStages, type AttachmentPickerKind, type Icon } from '../components/common'
import { GenerationSettingsMenu, ProjectSelectionMenu } from '../components/composer'

type ConversationFeedItem =
  | { readonly kind: 'message'; readonly createdAt: string; readonly message: DesignMessage }
  | { readonly kind: 'step'; readonly createdAt: string; readonly step: GenerationStep }
  | { readonly kind: 'activity'; readonly createdAt: string; readonly id: string; readonly steps: GenerationStep[] }

// Interleave persisted user/assistant messages with the recorded generation milestones so the major
// steps of each run appear in the conversation history in the order they happened.
function buildConversationFeed(design: OmniDesignDocument, detail: 'full' | 'concise'): ConversationFeedItem[] {
  const items: ConversationFeedItem[] = [
    ...design.messages.map((message) => ({ kind: 'message' as const, createdAt: message.createdAt, message })),
    ...design.generationSteps.filter((step) => detail === 'full' || terminalGenerationStages.includes(step.stage)).map((step) => ({ kind: 'step' as const, createdAt: step.createdAt, step })),
  ]
  const sorted = items.sort((first, second) => first.createdAt < second.createdAt ? -1 : first.createdAt > second.createdAt ? 1 : 0)
  if (detail === 'concise') return sorted
  return sorted.reduce<ConversationFeedItem[]>((feed, item) => {
    if (item.kind !== 'step' || terminalGenerationStages.includes(item.step.stage)) return [...feed, item]
    const previous = feed.at(-1)
    if (previous?.kind === 'activity') {
      previous.steps.push(item.step)
      return feed
    }
    return [...feed, { kind: 'activity', createdAt: item.createdAt, id: item.step.id, steps: [item.step] }]
  }, [])
}

// One conversational turn. The user's prompt reads as a trailing-aligned bubble; OmniDesign's reply
// reads as an avatar-led narrative, so the two sides of the exchange are distinguishable at a glance
// without wrapping every generation event in a card.
function ConversationMessage({ message, onOpenAttachment }: { readonly message: DesignMessage; readonly onOpenAttachment: (attachment: DesignAttachment) => void }) {
  // System notices from OmniDesign itself read as a quiet inline note — visibly distinct from both the
  // user's prompt bubble and the design agent's reply, so it is clear the app is speaking, not the agent.
  if (message.role === 'system') {
    return (
      <div className="conversation-system" role="note">
        <InformationCircleIcon aria-hidden="true" />
        <p>{message.text}</p>
      </div>
    )
  }
  const isUser = message.role === 'user'
  return (
    <article className={`conversation-message message-${message.role}`}>
      <span className={`message-avatar${isUser ? ' message-avatar-you' : ''}`} aria-hidden="true">{isUser ? 'OD' : <SparklesIcon />}</span>
      <div className="message-body">
        <span className="message-role">{isUser ? 'You' : 'OmniDesign'}</span>
        <div className="message-bubble">
          {isUser ? <p>{message.text}</p> : <Markdown text={message.text} />}
          {message.attachments?.length ? <div className="message-attachments" aria-label="References supplied with this prompt">{message.attachments.map((attachment) => <Button className="attachment-chip attachment-link" data-status={attachment.status} key={attachment.id} isDisabled={attachment.status !== 'available'} onPress={() => onOpenAttachment(attachment)}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}</Button>)}</div> : null}
        </div>
      </div>
    </article>
  )
}

function describeStoppedGeneration(job: GenerationJob): { readonly title: string; readonly message: string; readonly openProviders: boolean } {
  const error = job.error ?? ''
  if (job.state === 'interrupted') return { title: 'Generation interrupted', message: 'OmniDesign closed before this work finished. Continue from retained files or retry from the last revision.', openProviders: false }
  if (job.state === 'cancelled') return { title: 'Generation cancelled', message: 'The previous revision is still active. Continue from retained files or start a fresh retry.', openProviders: false }
  if (/ENOTFOUND|ECONN|network|offline|fetch failed|socket|timed? out/i.test(error)) return { title: 'Provider connection unavailable', message: 'Check your connection and provider service, then retry.', openProviders: false }
  if (/auth|sign.?in|log.?in|unauthorized|credential/i.test(error)) return { title: 'Provider sign-in required', message: 'Sign in again or choose another available provider before continuing.', openProviders: true }
  if (/model.*(?:unavailable|not found|unsupported)|selected model/i.test(error)) return { title: 'Selected model unavailable', message: 'Choose an available provider and model before sending another prompt.', openProviders: true }
  return { title: 'Generation failed', message: 'Review the technical details, then continue partial work or retry from the last revision.', openProviders: false }
}

const layoutModes: readonly { readonly id: LayoutMode; readonly label: string; readonly icon: Icon }[] = [
  { id: 'split', label: 'Split view', icon: ViewColumnsIcon },
  { id: 'conversation', label: 'Conversation only', icon: ChatBubbleLeftRightIcon },
  { id: 'preview', label: 'Preview only', icon: WindowIcon },
  { id: 'popped', label: 'Pop out preview', icon: ArrowTopRightOnSquareIcon },
]

function LayoutMenu({ mode, onChange }: { readonly mode: LayoutMode; readonly onChange: (mode: LayoutMode) => void }) {
  const current = layoutModes.find((candidate) => candidate.id === mode) ?? layoutModes[0]
  const CurrentIcon = current.icon
  return (
    <DropdownButton
      label={`Layout: ${current.label}`}
      triggerClassName="toolbar-button"
      popoverClassName="project-popover layout-menu"
      placement="bottom"
      trigger={<><CurrentIcon aria-hidden="true" />{current.label}</>}
    >
      <Menu aria-label="Workspace layout" onAction={(key) => onChange(key as LayoutMode)}>
        {layoutModes.map((option) => {
          const OptionIcon = option.icon
          return <MenuItem id={option.id} key={option.id} textValue={option.label}><span><OptionIcon aria-hidden="true" />{option.label}</span>{mode === option.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>
        })}
      </Menu>
    </DropdownButton>
  )
}

export function DesignWorkspace({ design, providers, projects, associationNotice, activity, busy, detailLevel, onBack, onChange, onRename, onTrash, onAssociate, onAssociateAndRestart, onDismissAssociation, onOpenProviders, onOpenDefinitions }: {
  readonly design: OmniDesignDocument
  readonly providers: readonly ProviderStatus[]
  readonly projects: readonly ProjectSummary[]
  readonly associationNotice: { readonly projectId: string; readonly projectName: string; readonly mode: 'associated' | 'suggested' } | null
  readonly activity: GenerationActivity | null
  readonly busy: boolean
  readonly detailLevel: 'full' | 'concise'
  readonly onBack: () => void
  readonly onChange: (design: OmniDesignDocument) => void
  readonly onRename: (design: OmniDesignDocument, title: string) => Promise<OmniDesignDocument>
  readonly onTrash: (design: OmniDesignDocument) => Promise<void>
  readonly onAssociate: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onAssociateAndRestart: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onDismissAssociation: () => void
  readonly onOpenProviders: () => void
  readonly onOpenDefinitions: () => void
}) {
  const [draft, setDraft] = useState(design.draft)
  const [attachments, setAttachments] = useState<readonly DesignAttachment[]>(design.draftAttachments)
  const [associateCloneOpen, setAssociateCloneOpen] = useState(false)
  const [associateCloneUrl, setAssociateCloneUrl] = useState('')
  const [associateCloneDestination, setAssociateCloneDestination] = useState('')
  const [associateCloneError, setAssociateCloneError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ readonly tone: 'success' | 'error'; readonly message: string; readonly detail?: string } | null>(null)
  const [associatingClone, setAssociatingClone] = useState(false)
  const [conversationWidth, setConversationWidth] = useState(design.layout.conversationWidth)
  const [mode, setMode] = useState<LayoutMode>(design.layout.mode)
  const [selection, setSelection] = useState<GenerationSelection>(design.lastSelection)
  const [revisionPages, setRevisionPages] = useState<RevisionPages | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewPage, setPreviewPage] = useState<string | null>(design.layout.previewPage)
  const [previewViewMode, setPreviewViewMode] = useState<PreviewViewMode>(design.layout.previewViewMode)
  const [previewFit, setPreviewFit] = useState<PreviewFit>(design.layout.previewFit)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(design.layout.previewDevice)
  const [previewCustomWidth, setPreviewCustomWidth] = useState(design.layout.previewCustomWidth)
  const [previewCustomHeight, setPreviewCustomHeight] = useState(design.layout.previewCustomHeight)
  const [customSizeOpen, setCustomSizeOpen] = useState(false)
  const [customWidthDraft, setCustomWidthDraft] = useState(String(design.layout.previewCustomWidth))
  const [customHeightDraft, setCustomHeightDraft] = useState(String(design.layout.previewCustomHeight))
  const [pageRename, setPageRename] = useState<{ readonly path: string; readonly value: string } | null>(null)
  const split = useRef<HTMLDivElement>(null)
  // Keep the conversation pinned to the bottom while the user is already there (within a 30px
  // deadzone); if they have scrolled up to read, leave their position alone.
  const feed = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const scrollFeedToBottom = () => { const element = feed.current; if (element) element.scrollTop = element.scrollHeight }
  const onFeedScroll = () => {
    const element = feed.current
    if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 30
  }
  // Opening a design (or re-showing the feed after a layout change) starts pinned to the bottom.
  useLayoutEffect(() => { stickToBottom.current = true; scrollFeedToBottom() }, [design.id, mode])
  // While new content streams in, follow it to the bottom only when the user is already there.
  useEffect(() => {
    const element = feed.current
    if (!element || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => { if (stickToBottom.current) element.scrollTop = element.scrollHeight })
    observer.observe(element, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [mode])
  const selectedIsHead = design.selectedRevisionId === design.activeRevisionId
  const selectedRevision = design.revisions.find((revision) => revision.id === design.selectedRevisionId)
  const latestInvalidCandidate = design.invalidCandidates.at(-1)
  // Only surface a rejected candidate while it is still the design's latest outcome. Once a later
  // revision lands (e.g. a repair attempt succeeded), the rejection is history, not a current problem.
  const latestRevision = design.revisions.at(-1)
  const invalidCandidateVisible = latestInvalidCandidate && (!latestRevision || latestInvalidCandidate.createdAt > latestRevision.createdAt)
  const runningJob = design.generationJobs.find((job) => job.state === 'running')
  const queuedJobs = design.generationJobs.filter((job) => job.state === 'queued')
  const activeJob = runningJob ?? queuedJobs[0]
  const latestJob = design.generationJobs.at(-1)
  const retryableJob = design.queuePaused
    ? [...design.generationJobs].reverse().find((job) => ['failed', 'cancelled', 'interrupted'].includes(job.state))
    : latestJob && ['failed', 'cancelled', 'interrupted'].includes(latestJob.state) ? latestJob : undefined
  const stoppedGeneration = retryableJob ? describeStoppedGeneration(retryableJob) : null
  const api = window.omnidesign?.workspace
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const hasUsableSelection = readyProviders.some((provider) => provider.id === selection.providerId && provider.models.some((model) => model.id === selection.modelId))
  const runWorkspaceAction = async <T,>(action: () => Promise<T>, failureMessage: string): Promise<T | undefined> => {
    setFeedback(null)
    try {
      return await action()
    } catch (reason) {
      setFeedback({
        tone: 'error',
        message: failureMessage,
        ...(reason instanceof Error && reason.message ? { detail: reason.message } : {}),
      })
      return undefined
    }
  }

  useEffect(() => setDraft(design.draft), [design.id, design.draft])
  useEffect(() => setAttachments(design.draftAttachments), [design.id, design.draftAttachments])
  useEffect(() => setConversationWidth(design.layout.conversationWidth), [design.id, design.layout.conversationWidth])
  useEffect(() => setMode(design.layout.mode), [design.id, design.layout.mode])
  useEffect(() => setSelection(design.lastSelection), [design.id])
  useEffect(() => {
    setPreviewViewMode(design.layout.previewViewMode)
    setPreviewFit(design.layout.previewFit)
    setPreviewDevice(design.layout.previewDevice)
    setPreviewCustomWidth(design.layout.previewCustomWidth)
    setPreviewCustomHeight(design.layout.previewCustomHeight)
  }, [design.id, design.layout.previewViewMode, design.layout.previewFit, design.layout.previewDevice, design.layout.previewCustomWidth, design.layout.previewCustomHeight])
  // Register the selected revision's files with the preview server, which returns the opaque token the
  // iframes load from plus the discovered pages. The preview defaults to the home page.
  useEffect(() => {
    const revisionId = design.selectedRevisionId
    if (!api || !revisionId) { setRevisionPages(null); setPreviewToken(null); setPreviewPage(null); return }
    let cancelled = false
    void window.omnidesign?.preview.register(design.id, revisionId)
      .then((result) => {
        if (cancelled || !result) { if (!cancelled) { setRevisionPages(null); setPreviewToken(null) } return }
        setRevisionPages({ pages: result.pages, entryPagePath: result.entryPagePath })
        setPreviewToken(result.token)
        setPreviewPage((current) => current && result.pages.some((page) => page.path === current) ? current : result.entryPagePath)
      })
      .catch(() => { if (!cancelled) { setRevisionPages(null); setPreviewToken(null); setPreviewPage(null) } })
    return () => { cancelled = true }
  }, [api, design.id, design.selectedRevisionId])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    const save = window.omnidesign?.workspace.saveSelection?.(design.id, next)
    if (save) void save.catch((reason: unknown) => setFeedback({ tone: 'error', message: 'Generation settings could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) }))
  }
  // Re-register the current revision after page metadata changes so the discovered pages reflect the
  // new home page and titles (the token is stable, so the iframes do not reload).
  const refreshPreviewRegistration = async () => {
    const revisionId = design.selectedRevisionId
    if (!revisionId) return
    const result = await window.omnidesign?.preview.register(design.id, revisionId)
    if (result) { setRevisionPages({ pages: result.pages, entryPagePath: result.entryPagePath }); setPreviewToken(result.token) }
  }
  const setPageAsHome = async (path: string) => {
    if (!api) return
    const updated = await runWorkspaceAction(() => api.setEntryPage(design.id, path), 'The home page could not be set.')
    if (updated) { onChange(updated); await refreshPreviewRegistration() }
  }
  const commitPageRename = async () => {
    if (!api || !pageRename) return
    const title = pageRename.value.trim()
    const order = revisionPages?.pages.find((page) => page.path === pageRename.path)?.order ?? 0
    const target = pageRename.path
    setPageRename(null)
    const updated = await runWorkspaceAction(() => api.savePageMetadata(design.id, target, title || null, order), 'The page could not be renamed.')
    if (updated) { onChange(updated); await refreshPreviewRegistration() }
  }
  const openCustomSize = () => {
    setCustomWidthDraft(String(previewCustomWidth))
    setCustomHeightDraft(String(previewCustomHeight))
    setCustomSizeOpen(true)
  }
  const customWidth = Number(customWidthDraft)
  const customHeight = Number(customHeightDraft)
  const customSizeValid = Number.isInteger(customWidth) && customWidth >= 240 && customWidth <= 3840
    && Number.isInteger(customHeight) && customHeight >= 320 && customHeight <= 4320
  const applyCustomSize = () => {
    if (!customSizeValid) return
    setPreviewCustomWidth(customWidth)
    setPreviewCustomHeight(customHeight)
    setPreviewDevice('custom')
    setCustomSizeOpen(false)
  }
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveDraft(design.id, draft, attachments).catch((reason: unknown) => setFeedback({ tone: 'error', message: 'Your draft could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) })) }, 300)
    return () => window.clearTimeout(timer)
  }, [api, design.id, draft, attachments])
  useEffect(() => {
    if (!api) return
    const layout: Layout = { conversationWidth, mode, previewViewMode, previewFit, previewDevice, previewCustomWidth, previewCustomHeight, previewPage }
    const timer = window.setTimeout(() => { void api.saveLayout(design.id, layout).catch((reason: unknown) => setFeedback({ tone: 'error', message: 'The workspace layout could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) })) }, 250)
    return () => window.clearTimeout(timer)
  }, [api, conversationWidth, mode, previewViewMode, previewFit, previewDevice, previewCustomWidth, previewCustomHeight, previewPage, design.id])
  // While the popped-out layout is active, open the preview in its own window (a later revision reloads
  // it); leaving the layout or unmounting closes that window.
  useEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview || mode !== 'popped' || !design.selectedRevisionId) return
    void preview.popOut({ designId: design.id, revisionId: design.selectedRevisionId, ...(previewPage ? { page: previewPage } : {}) })
    return () => { void preview.closePopOut() }
  }, [mode, design.id, design.selectedRevisionId, previewPage])
  // If the user closes the popped-out preview window, return to the split layout.
  useEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview) return
    return preview.onPoppedIn((event) => { if (event.designId === design.id) setMode('split') })
  }, [design.id])

  const updateConversationWidth = (clientX: number) => {
    const bounds = split.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    setConversationWidth(Math.min(65, Math.max(35, ((clientX - bounds.left) / bounds.width) * 100)))
  }

  const submit = async () => {
    if (!api || !draft.trim() || busy || !selectedIsHead || !hasUsableSelection) return
    const prompt = draft.trim()
    const submittedAttachments = attachments
    setDraft('')
    setAttachments([])
    void api.saveDraft(design.id, '', [])
    const updated = await runWorkspaceAction(() => api.generate(design.id, prompt, selection.providerId, selection.modelId, selection.effort ?? undefined, submittedAttachments), 'The prompt could not be submitted. Your draft has been restored.')
    if (updated) onChange(updated)
    else {
      setDraft(prompt)
      setAttachments(submittedAttachments)
    }
  }
  const selectRevision = async (revisionId: string) => {
    if (!api || revisionId === design.selectedRevisionId) return
    const updated = await runWorkspaceAction(() => api.selectRevision(design.id, revisionId), 'That revision could not be opened.')
    if (updated) onChange(updated)
  }
  const restore = async () => {
    if (!api || !design.selectedRevisionId) return
    const updated = await runWorkspaceAction(() => api.restoreRevision(design.id, design.selectedRevisionId!), 'That revision could not be restored.')
    if (updated) onChange(updated)
  }
  const exportRevision = async () => {
    if (!api || !design.selectedRevisionId) return
    const result = await runWorkspaceAction(() => api.exportRevision(design.id, design.selectedRevisionId!), 'The design could not be exported.')
    if (result && !result.canceled) setFeedback({ tone: 'success', message: 'Export ready.', ...(result.filePath ? { detail: result.filePath } : {}) })
  }
  const cancelGeneration = async () => {
    if (!api || !runningJob) return
    const cancelled = await runWorkspaceAction(() => api.cancelGeneration(runningJob.id), 'Generation could not be stopped.')
    if (!cancelled) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The stopped generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const retryGeneration = async () => {
    if (!api || !retryableJob) return
    const retry = await runWorkspaceAction(() => api.retryGeneration(retryableJob.id), 'Generation could not be retried.')
    if (!retry) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The retried generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const removeGeneration = async (jobId: string) => {
    if (!api || !queuedJobs.some((job) => job.id === jobId)) return
    const removed = await runWorkspaceAction(() => api.removeGeneration(jobId), 'The queued prompt could not be removed.')
    if (!removed) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The queue could not be refreshed.')
    if (updated) onChange(updated)
  }
  const continueGeneration = async () => {
    if (!api || !retryableJob) return
    const continued = await runWorkspaceAction(() => api.continueGeneration(retryableJob.id), 'Generation could not continue.')
    if (!continued) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The continued generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const resumeGenerationQueue = async () => {
    if (!api || !design.queuePaused || retryableJob) return
    const updated = await runWorkspaceAction(() => api.resumeGenerationQueue(design.id), 'The queued work could not be resumed.')
    if (updated) onChange(updated)
  }
  const chooseAttachments = async (kind: AttachmentPickerKind) => {
    if (!api) return
    const selected = await runWorkspaceAction(() => api.chooseAttachments(kind), 'References could not be attached.')
    if (selected?.length) setAttachments((current) => [...current, ...selected.filter((attachment) => !current.some((existing) => existing.path === attachment.path))])
  }
  const adaptToAssociatedProject = async () => {
    if (!api || !associationNotice || busy) return
    const updated = await runWorkspaceAction(() => api.generate(design.id, `Adapt this design to the established design language of ${associationNotice.projectName}. Preserve its purpose while aligning visual language, interaction patterns, and relevant project conventions.`, selection.providerId, selection.modelId, selection.effort ?? undefined, attachments), 'The adaptation prompt could not be submitted.')
    if (updated) { onChange(updated); onDismissAssociation() }
  }
  const chooseAssociationTarget = async (key: string) => {
    if (!api) return
    if (key === 'folder') {
      const folder = await runWorkspaceAction(() => api.chooseProjectFolder(), 'The project folder could not be selected.')
      if (!folder) return
      const project = await runWorkspaceAction(() => api.registerLinkedProject(folder), 'The selected folder could not be linked.')
      if (project) await runWorkspaceAction(() => onAssociate(design, project.id), 'The design could not be associated with that project.')
      return
    }
    if (key === 'clone') {
      setAssociateCloneError(null)
      setAssociateCloneOpen(true)
      return
    }
    if (key.startsWith('project:')) await runWorkspaceAction(() => onAssociate(design, key.slice('project:'.length)), 'The design could not be associated with that project.')
  }
  const removeDesign = async () => { await runWorkspaceAction(() => onTrash(design), 'The design could not be moved to Trash.') }
  const renameDesign = async (title: string) => {
    const updated = await runWorkspaceAction(() => onRename(design, title), 'The design could not be renamed.')
    if (!updated) throw new Error('The design could not be renamed.')
    onChange(updated)
  }
  const associateSuggested = async () => {
    if (associationNotice) await runWorkspaceAction(() => onAssociate(design, associationNotice.projectId), 'The design could not be associated with that project.')
  }
  const restartSuggested = async () => {
    if (associationNotice) await runWorkspaceAction(() => onAssociateAndRestart(design, associationNotice.projectId), 'The design could not be associated and restarted.')
  }
  const chooseAssociateCloneDestination = async () => {
    setAssociateCloneError(null)
    try {
      const folder = await api?.chooseProjectFolder()
      if (folder) setAssociateCloneDestination(folder)
    } catch (reason) {
      setAssociateCloneError(reason instanceof Error && reason.message ? reason.message : 'The clone destination could not be selected.')
    }
  }
  const openAttachment = async (attachment: DesignAttachment) => {
    if (!api) return
    await runWorkspaceAction(() => api.openAttachment(attachment), 'The reference could not be opened.')
  }
  const confirmAssociateClone = async () => {
    if (!api || !associateCloneUrl.trim() || !associateCloneDestination || associatingClone) return
    setAssociatingClone(true)
    setAssociateCloneError(null)
    try {
      const project = await api.cloneProject(associateCloneUrl.trim(), associateCloneDestination)
      await onAssociate(design, project.id)
      setAssociateCloneOpen(false)
    } catch (reason) {
      setAssociateCloneError(reason instanceof Error ? reason.message : 'Unable to clone and associate the repository.')
    } finally {
      setAssociatingClone(false)
    }
  }

  const previewStatus = selectedRevision ? 'Offline · validated' : 'Waiting for revision'
  const providerStatus = selection.providerId === 'mock' ? 'Development provider' : `${selection.providerId} · ${selection.modelId}`

  const conversationPane = (
    <section className="conversation-pane" aria-label="Design conversation">
      <div className="conversation-feed" ref={feed} onScroll={onFeedScroll}>
        {buildConversationFeed(design, detailLevel).map((item) => item.kind === 'message'
          ? <ConversationMessage key={item.message.id} message={item.message} onOpenAttachment={(attachment) => void openAttachment(attachment)} />
          : item.kind === 'activity'
          ? <GenerationActivitySection id={item.id} key={item.id} steps={item.steps} />
          : <div className={`conversation-step step-${item.step.stage}`} key={item.step.id}><span className="conversation-step-label">{item.step.label}</span>{item.step.detail && <span className="conversation-step-detail">{item.step.detail}</span>}</div>)}
        {activity && (runningJob || (queuedJobs.length > 0 && !design.queuePaused)) && <div className="generation-progress" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span>{runningJob && <Button className="secondary-action" onPress={() => void cancelGeneration()}><StopIcon aria-hidden="true" />Stop</Button>}</div>}
        {queuedJobs.length > 0 && <section className="workspace-queue" aria-label="Queued prompts"><header><span><strong>{queuedJobs.length} queued prompt{queuedJobs.length === 1 ? '' : 's'}</strong><small>{design.queuePaused ? 'Waiting for you to resume generation' : runningJob ? 'Runs after the current request' : 'Waiting to start'}</small></span>{design.queuePaused && !retryableJob && <Button className="secondary-action" onPress={() => void resumeGenerationQueue()}>Resume queue</Button>}</header>{queuedJobs.map((job) => <article key={job.id}><span><strong>{job.prompt}</strong><small>{job.providerId === 'mock' ? 'Development provider' : `${job.providerId} · ${job.modelId}`}</small></span><Button className="text-button" onPress={() => void removeGeneration(job.id)}>Remove</Button></article>)}</section>}
        {feedback && <div className="workspace-feedback" data-tone={feedback.tone} role={feedback.tone === 'error' ? 'alert' : 'status'}><span><strong>{feedback.message}</strong>{feedback.detail && <small>{feedback.detail}</small>}</span><Button className="text-button" onPress={() => setFeedback(null)}>Dismiss</Button></div>}
        {!runningJob && retryableJob && stoppedGeneration && <div className="generation-recovery" role="status"><span><strong>{stoppedGeneration.title}</strong>{stoppedGeneration.message}{retryableJob.error && <details className="generation-recovery-details"><summary>Technical details</summary><pre>{retryableJob.error}</pre></details>}</span>{stoppedGeneration.openProviders && <Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button>}<Button className="secondary-action" onPress={() => void continueGeneration()}>Continue</Button><Button className="secondary-action" onPress={() => void retryGeneration()}><ArrowPathIcon aria-hidden="true" />Retry</Button></div>}
        {invalidCandidateVisible && <section className="invalid-candidate-notice" role="status">
          <strong>This version wasn’t applied</strong>
          <p>OmniDesign kept your last working design.</p>
          <details><summary>What went wrong</summary><p>{latestInvalidCandidate!.diagnostic}</p></details>
        </section>}
        {associationNotice?.mode === 'associated' && <div className="generation-recovery" role="status"><span><strong>Design associated with {associationNotice.projectName}.</strong>Optionally adapt this design to the linked project's design language in a new revision.</span><Button className="secondary-action" onPress={() => void adaptToAssociatedProject()}>Adapt design</Button><Button className="secondary-action" onPress={onDismissAssociation}>Keep current design</Button></div>}
        {associationNotice?.mode === 'suggested' && <div className="generation-recovery" role="status"><span><strong>Possible project match: {associationNotice.projectName}.</strong>This standalone request mentions the linked project; generation can continue while you associate it.</span><Button className="secondary-action" onPress={() => void associateSuggested()}>Associate project</Button>{activeJob && <Button className="secondary-action" onPress={() => void restartSuggested()}>Associate and restart</Button>}<Button className="secondary-action" onPress={onDismissAssociation}>Dismiss</Button></div>}
      </div>
      {!selectedIsHead && <div className="historical-banner"><ClockIcon aria-hidden="true" /><span><strong>Viewing an earlier revision</strong>Restore it as a new head before prompting.</span><Button className="secondary-action" onPress={() => void restore()}>Restore revision</Button></div>}
      <div className="workspace-composer">
        <TextField aria-label="Request a design change"><TextArea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next change…" disabled={!selectedIsHead} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }} /></TextField>
        {attachments.length > 0 && <div className="attachment-list" aria-label="Attached references">{attachments.map((attachment) => <span className="attachment-chip" data-status={attachment.status} key={attachment.id}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}<Button aria-label={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))}>×</Button></span>)}</div>}
        <div className="workspace-composer-footer"><AttachmentPicker placement="top" onChoose={(kind) => void chooseAttachments(kind)} /><GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} /><Button className="submit-prompt" aria-label="Send change" isDisabled={!draft.trim() || busy || !selectedIsHead || !hasUsableSelection} onPress={() => void submit()}><ArrowRightIcon aria-hidden="true" /></Button></div>
        {!hasUsableSelection && <div className="no-provider-notice no-provider-notice-workspace" role="status"><ExclamationTriangleIcon aria-hidden="true" /><span><strong>{readyProviders.length ? 'The selected provider or model is unavailable.' : 'Generation is unavailable.'}</strong><small>{readyProviders.length ? 'Choose an available provider before sending this draft.' : 'Connect a provider to send this draft. Existing history and export remain available.'}</small></span><Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button></div>}
      </div>
    </section>
  )

  const previewPages = revisionPages?.pages ?? []
  const currentPageLabel = previewPages.find((candidate) => candidate.path === previewPage)?.title ?? previewPage ?? 'Home'
  const deviceLabels: Record<PreviewDevice, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', custom: 'Custom' }
  const deviceIcons: Record<PreviewDevice, Icon> = { phone: DevicePhoneMobileIcon, tablet: DeviceTabletIcon, desktop: ComputerDesktopIcon, custom: ComputerDesktopIcon }
  const CurrentDeviceIcon = deviceIcons[previewDevice]
  const previewPane = (
    <section className="preview-pane" aria-label="Generated design preview">
      <div className="preview-toolbar">
        <span><CheckCircleIcon aria-hidden="true" />Isolated preview</span>
        <div className="preview-controls">
          <div className="preview-view-toggle" role="group" aria-label="Preview layout">
            <Button className="preview-toggle-option" data-active={previewViewMode === 'focused' || undefined} aria-pressed={previewViewMode === 'focused'} onPress={() => setPreviewViewMode('focused')}><WindowIcon aria-hidden="true" />Focused</Button>
            <Button className="preview-toggle-option" data-active={previewViewMode === 'canvas' || undefined} aria-pressed={previewViewMode === 'canvas'} onPress={() => setPreviewViewMode('canvas')}><Squares2X2Icon aria-hidden="true" />Canvas</Button>
          </div>
          {previewViewMode === 'focused' && previewPages.length > 1 && (
            <DropdownButton label="Preview page" triggerClassName="preview-page-picker" popoverClassName="project-popover" placement="bottom" trigger={<span>{currentPageLabel}</span>}>
              <Menu aria-label="Preview page" onAction={(key) => {
                const value = String(key)
                if (value === '__set_home__') { if (previewPage) void setPageAsHome(previewPage) }
                else if (value === '__rename__') { if (previewPage) setPageRename({ path: previewPage, value: previewPages.find((page) => page.path === previewPage)?.title ?? '' }) }
                else setPreviewPage(value)
              }}>
                <MenuSection className="project-popover-section">
                  <Header className="project-popover-header">Pages</Header>
                  {previewPages.map((candidate) => (
                    <MenuItem id={candidate.path} key={candidate.path} textValue={candidate.title ?? candidate.path}>
                      <span>{candidate.title ?? candidate.path}</span>
                      {candidate.isHome && <span className="preview-page-home">Home</span>}
                      {candidate.path === previewPage && <CheckCircleIcon aria-hidden="true" />}
                    </MenuItem>
                  ))}
                </MenuSection>
                <MenuSection className="project-popover-section">
                  <Header className="project-popover-header">{currentPageLabel}</Header>
                  <MenuItem id="__set_home__" textValue="Set as home page">Set as home page</MenuItem>
                  <MenuItem id="__rename__" textValue="Rename page">Rename page…</MenuItem>
                </MenuSection>
              </Menu>
            </DropdownButton>
          )}
          {previewViewMode === 'canvas' && <>
            <DropdownButton label="Device size" triggerClassName="preview-page-picker" popoverClassName="project-popover" placement="bottom" trigger={<><CurrentDeviceIcon aria-hidden="true" /><span>{deviceLabels[previewDevice]}</span></>}>
              <Menu aria-label="Device size" onAction={(key) => { if (key === 'custom') openCustomSize(); else setPreviewDevice(key as PreviewDevice) }}>
                {(['desktop', 'tablet', 'phone'] as const).map((option) => <MenuItem id={option} key={option} textValue={deviceLabels[option]}><span>{deviceLabels[option]}</span>{previewDevice === option && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
                <MenuItem id="custom" textValue="Custom size"><span>Custom…</span>{previewDevice === 'custom' && <CheckCircleIcon aria-hidden="true" />}</MenuItem>
              </Menu>
            </DropdownButton>
            <div className="preview-view-toggle" role="group" aria-label="Preview fit">
              <Button className="preview-toggle-option" data-active={previewFit === 'artboard' || undefined} aria-pressed={previewFit === 'artboard'} onPress={() => setPreviewFit('artboard')}>Artboard</Button>
              <Button className="preview-toggle-option" data-active={previewFit === 'fixed' || undefined} aria-pressed={previewFit === 'fixed'} onPress={() => setPreviewFit('fixed')}>Fixed</Button>
            </div>
          </>}
        </div>
        <small>{previewStatus}</small>
      </div>
      {previewToken && design.selectedRevisionId
        ? <DesignPreview designId={design.id} revisionId={design.selectedRevisionId} token={previewToken} captureNeeded={selectedIsHead && !!selectedRevision && !selectedRevision.thumbnailDataUrl} pages={previewPages} viewMode={previewViewMode} fit={previewFit} device={previewDevice} customWidth={previewCustomWidth} customHeight={previewCustomHeight} selectedPage={previewPage} onSelectPage={setPreviewPage} onOpenPage={(path) => { setPreviewPage(path); setPreviewViewMode('focused') }} />
        : <div className="preview-empty"><p>Preview appears after the first valid revision.</p></div>}
    </section>
  )

  return (
    <main className="workspace-main">
      <header className="workspace-toolbar">
        <IconButton label="Back" icon={ArrowLeftIcon} onPress={onBack} />
        <span className="workspace-title"><EditableTitle value={design.title} label="design" variant="workspace" pending={design.titlePending} onSave={renameDesign} /><small>{providerStatus} · {busy ? activity?.stage ?? 'Working' : 'Saved locally'}</small></span>
        <div className="toolbar-actions">
            <LayoutMenu mode={mode} onChange={setMode} />
          <DropdownButton
            triggerClassName="toolbar-button"
            popoverClassName="history-popover"
            placement="bottom"
            trigger={<><ClockIcon aria-hidden="true" />History · {design.revisions.length}</>}
          >
            <Menu aria-label="Revision history" onAction={(key) => void selectRevision(String(key))}>
              {[...design.revisions].reverse().map((revision, index) => (
                <MenuItem id={revision.id} key={revision.id} textValue={revision.prompt} className={revision.id === design.selectedRevisionId ? 'history-row history-row-active' : 'history-row'}>
                  {revision.thumbnailDataUrl
                    ? <img alt={`Preview of revision ${index === 0 ? 'current head' : index + 1}`} className="history-thumbnail" src={revision.thumbnailDataUrl} />
                    : <span className="history-thumbnail history-thumbnail-placeholder" aria-hidden="true" />}
                  <span><strong>{index === 0 ? `Current head · ${new Date(revision.createdAt).toLocaleString()}` : new Date(revision.createdAt).toLocaleString()}</strong><small title={revision.prompt}>{revision.prompt}</small></span>
                </MenuItem>
              ))}
            </Menu>
          </DropdownButton>
            {!design.sourceProjectPath && <DropdownButton triggerClassName="toolbar-button" popoverClassName="project-popover" placement="bottom" trigger={<><FolderIcon aria-hidden="true" />Associate</>}>
              <ProjectSelectionMenu projects={projects.filter((project) => project.id !== design.projectId)} includeStandalone={false} onAction={(key) => void chooseAssociationTarget(key)} />
            </DropdownButton>}
          <Button className="toolbar-button" onPress={() => void exportRevision()} isDisabled={!design.selectedRevisionId}><ArrowDownTrayIcon aria-hidden="true" />Export</Button>
          <Button className="toolbar-button" onPress={onOpenDefinitions}><SwatchIcon aria-hidden="true" />Definitions</Button>
          <Button className="toolbar-button" onPress={() => void removeDesign()}><TrashIcon aria-hidden="true" />Remove</Button>
        </div>
      </header>
      <AppModal isOpen={pageRename !== null} onOpenChange={(open) => { if (!open) setPageRename(null) }} title="Rename page">
        {(close) => <>
          <p>Give this page a display title. The file name on disk stays the same.</p>
          <TextField aria-label="Page title"><Input autoFocus value={pageRename?.value ?? ''} maxLength={200} placeholder="Page title" onChange={(event) => setPageRename((current) => current ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Enter') { void commitPageRename(); close() } }} /></TextField>
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" onPress={() => { void commitPageRename(); close() }}>Save</Button></div>
        </>}
      </AppModal>
      <AppModal isOpen={customSizeOpen} onOpenChange={setCustomSizeOpen} title="Custom preview size">
        {() => <>
          <p>Set the canvas artboard dimensions. Focused mode always fills the available preview pane.</p>
          <div className="clone-modal-fields preview-custom-size-fields">
            <TextField aria-label="Custom preview width"><Input autoFocus inputMode="numeric" value={customWidthDraft} onChange={(event) => setCustomWidthDraft(event.target.value)} placeholder="Width" /></TextField>
            <TextField aria-label="Custom preview height"><Input inputMode="numeric" value={customHeightDraft} onChange={(event) => setCustomHeightDraft(event.target.value)} placeholder="Height" /></TextField>
          </div>
          <p className="clone-modal-note">Width 240–3,840 px · height 320–4,320 px</p>
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={() => setCustomSizeOpen(false)}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!customSizeValid} onPress={applyCustomSize}>Apply size</Button></div>
        </>}
      </AppModal>
      <AppModal isOpen={associateCloneOpen} onOpenChange={setAssociateCloneOpen} className="clone-modal" title="Clone and associate repository">
        {(close) => <>
          <p>OmniDesign will clone the repository into a new folder inside the destination you choose, then associate this design with it.</p>
          <div className="clone-modal-fields">
            <TextField aria-label="Git repository URL"><Input value={associateCloneUrl} onChange={(event) => setAssociateCloneUrl(event.target.value)} placeholder="git@github.com:team/project.git" /></TextField>
            <div className="clone-destination"><TextField aria-label="Destination folder"><Input value={associateCloneDestination} onChange={(event) => setAssociateCloneDestination(event.target.value)} placeholder="Destination folder" /></TextField><Button className="secondary-action" onPress={() => void chooseAssociateCloneDestination()}>Choose folder</Button></div>
          </div>
          <p className="clone-modal-note">For example, <code>project.git</code> will be cloned to a new <code>project</code> folder inside the destination.</p>
          {associateCloneError && <p className="generation-recovery" role="alert">{associateCloneError}</p>}
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!associateCloneUrl.trim() || !associateCloneDestination || associatingClone} onPress={() => void confirmAssociateClone()}>{associatingClone ? 'Cloning…' : 'Clone and associate'}</Button></div>
        </>}
      </AppModal>
      {mode === 'split'
        ? <div className="workspace-split" ref={split} style={{ gridTemplateColumns: `minmax(380px, ${conversationWidth}%) 8px minmax(0, 1fr)` }}>
            {conversationPane}
            <div
              aria-label="Resize conversation and preview panels"
              aria-orientation="vertical"
              aria-valuemax={65}
              aria-valuemin={35}
              aria-valuenow={Math.round(conversationWidth)}
              className="workspace-divider"
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); setConversationWidth((current) => Math.max(35, current - 2)) }
                if (event.key === 'ArrowRight') { event.preventDefault(); setConversationWidth((current) => Math.min(65, current + 2)) }
                if (event.key === 'Home') { event.preventDefault(); setConversationWidth(35) }
                if (event.key === 'End') { event.preventDefault(); setConversationWidth(65) }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                updateConversationWidth(event.clientX)
              }}
              onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateConversationWidth(event.clientX) }}
              role="separator"
              tabIndex={0}
            />
            {previewPane}
          </div>
        : mode === 'preview'
        ? <div className="workspace-single">{previewPane}</div>
        : <div className="workspace-single">
            {mode === 'popped' && <div className="popped-preview-note" role="status"><WindowIcon aria-hidden="true" /><span>Preview is open in a separate window.</span><Button className="secondary-action" onPress={() => setMode('split')}>Dock preview</Button></div>}
            {conversationPane}
          </div>}
    </main>
  )
}
