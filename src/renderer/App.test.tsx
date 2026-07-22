import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const design: OmniDesignDocument = {
  id: 'design-1',
  projectId: 'project-1',
  projectName: 'Calm dashboard',
  sourceProjectPath: null,
  title: 'Calm dashboard',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  activeRevisionId: 'revision-1',
  selectedRevisionId: 'revision-1',
  draft: '',
  draftAttachments: [],
  thumbnailDataUrl: null,
  queuePaused: false,
  lastSelection: { providerId: 'mock', modelId: 'mock-v1', effort: null },
  generationSteps: [],
  layout: { conversationWidth: 43, mode: 'split' },
  messages: [{ id: 'message-1', role: 'user', text: 'A calm dashboard', createdAt: '2026-07-20T10:00:00.000Z' }],
  invalidCandidates: [],
  generationJobs: [],
  revisions: [{ id: 'revision-1', parentRevisionId: null, prompt: 'A calm dashboard', providerId: 'mock', modelId: 'mock-v1', createdAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, diagnostics: [] }],
}

function projectFromDesign(candidate: OmniDesignDocument): ProjectSummary {
  return {
    id: candidate.projectId,
    name: candidate.projectName,
    kind: 'standalone',
    sourceProjectPath: null,
    sourceAvailable: true,
    designCount: 1,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    thumbnailDataUrl: candidate.thumbnailDataUrl,
    latestDesignTitle: candidate.title,
    latestPrompt: candidate.messages.find((message) => message.role === 'user')?.text ?? null,
  }
}

function installBridge(initialDesigns: OmniDesignDocument[] = [], createdDesign: OmniDesignDocument = design) {
  const listeners: Array<(activity: GenerationActivity) => void> = []
  const projectMap = new Map<string, ProjectSummary>()
  for (const candidate of initialDesigns) {
    const existing = projectMap.get(candidate.projectId)
    projectMap.set(candidate.projectId, existing ? { ...existing, designCount: existing.designCount + 1 } : projectFromDesign(candidate))
  }
  const projects = [...projectMap.values()]
  const bridge = {
    providers: {
      discover: vi.fn().mockResolvedValue([
        { id: 'mock', name: 'Development provider', installed: true, authenticated: true, detail: 'Ready', models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }] },
        { id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] },
      ]),
      prompt: vi.fn(),
      onActivity: vi.fn().mockReturnValue(() => undefined),
    },
    workspace: {
      list: vi.fn().mockResolvedValue(initialDesigns),
      listProjects: vi.fn().mockResolvedValue(projects),
      getProject: vi.fn(async (projectId: string) => {
        const project = projects.find((candidate) => candidate.id === projectId)
        return project ? { project, designs: initialDesigns.filter((candidate) => candidate.projectId === projectId) } : null
      }),
      listTrash: vi.fn().mockResolvedValue([]),
      cloneProject: vi.fn(),
      registerLinkedProject: vi.fn(),
      reconnectProject: vi.fn(),
      convertProjectToStandalone: vi.fn(),
      associateDesign: vi.fn().mockResolvedValue(createdDesign),
      associateAndRestart: vi.fn().mockResolvedValue(createdDesign),
      trash: vi.fn().mockResolvedValue({ cancelled: false }),
      restoreTrash: vi.fn().mockResolvedValue(undefined),
      purgeTrash: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(createdDesign),
      renameDesign: vi.fn(async (designId: string, title: string) => {
        const candidate = initialDesigns.find((item) => item.id === designId) ?? createdDesign
        return { ...candidate, title, ...(candidate.sourceProjectPath ? {} : { projectName: title }) }
      }),
      renameProject: vi.fn(async (projectId: string, name: string) => ({ ...(projects.find((project) => project.id === projectId) ?? projectFromDesign(createdDesign)), name })),
      create: vi.fn().mockResolvedValue(createdDesign),
      generate: vi.fn().mockResolvedValue(design),
      chooseProjectFolder: vi.fn().mockResolvedValue(null),
      chooseAttachments: vi.fn().mockResolvedValue([]),
      openAttachment: vi.fn().mockResolvedValue(undefined),
      cancelGeneration: vi.fn().mockResolvedValue(undefined),
      removeGeneration: vi.fn().mockResolvedValue(undefined),
      retryGeneration: vi.fn().mockResolvedValue(undefined),
      selectRevision: vi.fn().mockResolvedValue(design),
      restoreRevision: vi.fn().mockResolvedValue(design),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      saveLayout: vi.fn().mockResolvedValue(undefined),
      exportRevision: vi.fn().mockResolvedValue({ canceled: true }),
      onActivity: vi.fn((listener: (activity: GenerationActivity) => void) => { listeners.push(listener); return () => undefined }),
      onCloneActivity: vi.fn().mockReturnValue(() => undefined),
    },
    preview: {
      show: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
      popOut: vi.fn().mockResolvedValue(undefined),
      setSuspended: vi.fn().mockResolvedValue(undefined),
      freeze: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw=='),
      onDiagnostic: vi.fn().mockReturnValue(() => undefined),
      onThumbnail: vi.fn().mockReturnValue(() => undefined),
      onPoppedIn: vi.fn().mockReturnValue(() => undefined),
    },
    settings: {
      getTheme: vi.fn().mockResolvedValue('dark'),
      saveTheme: vi.fn().mockResolvedValue(undefined),
      getNotificationsEnabled: vi.fn().mockResolvedValue(true),
      saveNotificationsEnabled: vi.fn().mockResolvedValue(undefined),
      getGenerationDetail: vi.fn().mockResolvedValue('full'),
      saveGenerationDetail: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Window['omnidesign']
  Object.defineProperty(window, 'omnidesign', { value: bridge, configurable: true })
  return Object.assign(bridge, {
    emitWorkspaceActivity(activity: GenerationActivity) {
      for (const listener of listeners) listener(activity)
    },
  })
}

afterEach(cleanup)

describe('Phase 1 walking skeleton UI', () => {
  it('renders the accepted home composition and required actions', () => {
    installBridge()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Start with an idea.' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Create a design' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Continue designing' })).toBeInTheDocument()
    expect(screen.getByText('Your first design starts above')).toBeInTheDocument()
  })

  it('keeps the development provider available when an installed provider has no selectable models', async () => {
    installBridge()
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Generation settings' })).toHaveTextContent('Development provider'))
  })

  it('keeps project access available while generation waits for a provider', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.providers.discover).mockResolvedValue([])
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A new direction' } })
    expect(await screen.findByText('Connect a provider to start generating.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create design' })).toBeDisabled()
    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    expect(within(sidebar).getByRole('button', { name: 'Calm dashboard' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Open providers' }))
    expect(await screen.findByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(bridge.workspace.create).not.toHaveBeenCalled()
  })

  it('preserves a follow-up draft when its previous provider is unavailable', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.providers.discover).mockResolvedValue([])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    const prompt = await screen.findByRole('textbox', { name: 'Request a design change' })
    fireEvent.change(prompt, { target: { value: 'Keep this draft safe' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    expect(screen.getByText('Generation is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send change' })).toBeDisabled()
    expect(prompt).toHaveValue('Keep this draft safe')
    expect(bridge.workspace.generate).not.toHaveBeenCalled()
  })

  it('opens provider availability and refreshes local provider discovery', async () => {
    const bridge = installBridge()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))
    expect(await screen.findByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getAllByText('Ready')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(bridge.providers.discover).toHaveBeenCalledTimes(3))
  })

  it('opens the recoverable trash view', async () => {
    installBridge()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    expect(await screen.findByRole('heading', { name: 'Trash' })).toBeInTheDocument()
    expect(screen.getByText('No deleted projects or designs.')).toBeInTheDocument()
  })

  it('requires confirmation before permanently deleting trash', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.listTrash).mockResolvedValue([{
      id: 'design-1', kind: 'design', name: 'Calm dashboard', projectId: 'project-1', projectName: 'Calm dashboard', sourceProjectPath: null,
      trashedAt: '2026-07-20T10:00:00.000Z', purgeAt: '2026-08-19T10:00:00.000Z',
    }])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }))
    expect(screen.getByRole('dialog', { name: 'Permanently delete Calm dashboard?' })).toHaveTextContent('cannot be undone')
    expect(bridge.workspace.purgeTrash).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(bridge.workspace.purgeTrash).toHaveBeenCalledWith('design', 'design-1'))
  })

  it('confirms before emptying all trash items', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.listTrash).mockResolvedValue([
      { id: 'design-1', kind: 'design', name: 'Calm dashboard', projectId: 'project-1', projectName: 'Calm dashboard', sourceProjectPath: null, trashedAt: '2026-07-20T10:00:00.000Z', purgeAt: '2026-08-19T10:00:00.000Z' },
      { id: 'project-2', kind: 'project', name: 'Aurora', projectId: null, projectName: null, sourceProjectPath: 'C:\\Projects\\Aurora', trashedAt: '2026-07-20T10:00:00.000Z', purgeAt: '2026-08-19T10:00:00.000Z' },
    ])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Empty trash' }))
    expect(screen.getByRole('dialog', { name: 'Empty trash?' })).toHaveTextContent('all 2 trashed items')
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))

    await waitFor(() => expect(bridge.workspace.purgeTrash).toHaveBeenCalledTimes(2))
  })

  it('shows active work globally and can remove queued work from the generations view', async () => {
    const queuedDesign: OmniDesignDocument = {
      ...design,
      queuePaused: true,
      generationJobs: [{
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Try a warmer direction', providerId: 'mock', modelId: 'mock-v1', state: 'queued',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [],
      }],
    }
    const bridge = installBridge([queuedDesign])
    render(<App />)

    await screen.findAllByText('Calm dashboard')
    fireEvent.click(screen.getByRole('button', { name: /Generations/ }))
    expect(await screen.findByRole('heading', { name: 'Generations' })).toBeInTheDocument()
    expect(screen.getByText(/Try a warmer direction/)).toBeInTheDocument()
    expect(screen.getByText(/Queue paused/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(bridge.workspace.removeGeneration).toHaveBeenCalledWith('7e3670bd-2f6c-444d-afd0-a26e17839964'))
  })

  it('shows recent detailed progress for a running generation', async () => {
    const runningDesign: OmniDesignDocument = {
      ...design,
      projectName: 'Aurora project',
      generationJobs: [{
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Try a warmer direction', providerId: 'codex', modelId: 'gpt-5.6', state: 'running',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: null, error: null, attachments: [],
      }],
      generationSteps: [
        { id: 'old-step', stage: 'complete', label: 'Completed', detail: 'Earlier run', createdAt: '2026-07-20T10:00:30.000Z' },
        { id: 'step-1', stage: 'generating', label: 'Agent action', detail: 'Reading src/App.tsx', createdAt: '2026-07-20T10:01:02.000Z' },
        { id: 'step-2', stage: 'validating', label: 'Validating', detail: 'Checking responsive layout', createdAt: '2026-07-20T10:01:03.000Z' },
      ],
    }
    installBridge([runningDesign], runningDesign)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Generations/ }))
    const progress = await screen.findByText('Progress details')
    expect(screen.getByRole('button', { name: 'Aurora project, Calm dashboard: Validating' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generations/ })).toHaveTextContent('1')
    expect(progress.closest('details')).toHaveAttribute('open')
    expect(screen.getByText('Reading src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('Checking responsive layout')).toBeInTheDocument()
    expect(screen.queryByText('Earlier run')).not.toBeInTheDocument()
  })

  it('keeps background activity associated with the correct design', async () => {
    const runningJob = (id: string, designId: string): GenerationJob => ({
      id, designId, prompt: 'Refine it', providerId: 'mock', modelId: 'mock-v1', state: 'running', attachments: [],
      createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: null, error: null,
    })
    const alpha = { ...design, title: 'Alpha design', projectName: 'Alpha design', generationJobs: [runningJob('11111111-1111-4111-8111-111111111111', 'design-1')] }
    const beta = { ...design, id: 'design-2', projectId: 'project-2', title: 'Beta design', projectName: 'Beta design', generationJobs: [runningJob('22222222-2222-4222-8222-222222222222', 'design-2')] }
    const bridge = installBridge([alpha, beta], alpha)
    vi.mocked(bridge.workspace.get).mockImplementation(async (designId) => designId === alpha.id ? alpha : beta)
    render(<App />)

    await screen.findByRole('button', { name: 'Alpha design' })
    await act(async () => {
      bridge.emitWorkspaceActivity({ designId: alpha.id, stage: 'generating', detail: 'Alpha is rendering.' })
      bridge.emitWorkspaceActivity({ designId: beta.id, stage: 'validating', detail: 'Beta is validating.' })
    })
    expect(screen.getByRole('heading', { name: 'Start with an idea.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alpha design' }))

    expect(await screen.findByText('Alpha is rendering.')).toBeInTheDocument()
    expect(screen.queryByText('Beta is validating.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send change' })).toBeDisabled()
  })

  it('groups full generation activity into an open collapsible section', async () => {
    const activityDesign: OmniDesignDocument = {
      ...design,
      generationSteps: [
        { id: 'step-1', stage: 'queued', label: 'Queued', detail: 'Waiting to start', createdAt: '2026-07-20T10:00:01.000Z' },
        { id: 'step-2', stage: 'generating', label: 'Generating', detail: 'Reading project files', createdAt: '2026-07-20T10:00:02.000Z' },
        { id: 'step-3', stage: 'validating', label: 'Validating', detail: 'Checking the candidate', createdAt: '2026-07-20T10:00:03.000Z' },
        { id: 'step-4', stage: 'complete', label: 'Completed', detail: '1,326 tokens used', createdAt: '2026-07-20T10:00:04.000Z' },
      ],
    }
    installBridge([activityDesign], activityDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    const summary = await screen.findByText('Generation details')
    const details = summary.closest('details')
    expect(details).toHaveAttribute('open')
    expect(details).toHaveTextContent('2 updates')
    expect(details).toHaveTextContent('Reading project files')
    expect(screen.getByText('1,326 tokens used')).toBeInTheDocument()

    fireEvent.click(summary)
    await waitFor(() => expect(details).not.toHaveAttribute('open'))
  })

  it('keeps only queue and outcome milestones in concise generation history', async () => {
    const activityDesign: OmniDesignDocument = {
      ...design,
      generationSteps: [
        { id: 'step-1', stage: 'queued', label: 'Queued', detail: 'Waiting to start', createdAt: '2026-07-20T10:00:01.000Z' },
        { id: 'step-2', stage: 'generating', label: 'Generating', detail: 'Reading project files', createdAt: '2026-07-20T10:00:02.000Z' },
        { id: 'step-3', stage: 'complete', label: 'Completed', detail: '1,326 tokens used', createdAt: '2026-07-20T10:00:03.000Z' },
      ],
    }
    const bridge = installBridge([activityDesign], activityDesign)
    vi.mocked(bridge.settings.getGenerationDetail).mockResolvedValue('concise')
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    expect(await screen.findByText('1,326 tokens used')).toBeInTheDocument()
    expect(screen.getByText('Waiting to start')).toBeInTheDocument()
    expect(screen.queryByText('Generation details')).not.toBeInTheDocument()
    expect(screen.queryByText('Reading project files')).not.toBeInTheDocument()
  })

  it('creates a design through the workspace bridge and opens the split workspace', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('A calm dashboard', 'mock', 'mock-v1', undefined, null))
    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
  })

  it('stays in the workspace when active-work removal is cancelled', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.trash).mockResolvedValue({ cancelled: true })
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(bridge.workspace.trash).toHaveBeenCalledWith('design', 'design-1'))
    expect(screen.getByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    expect(bridge.preview.hide).not.toHaveBeenCalled()
  })

  it('restores a follow-up draft and explains when submission fails', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.generate).mockRejectedValueOnce(new Error('Provider connection unavailable.'))
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    const followUp = await screen.findByRole('textbox', { name: 'Request a design change' })
    fireEvent.change(followUp, { target: { value: 'Make the hierarchy clearer' } })
    fireEvent.keyDown(followUp, { key: 'Enter' })

    expect(await screen.findByRole('alert')).toHaveTextContent('The prompt could not be submitted. Your draft has been restored.')
    expect(screen.getByText('Provider connection unavailable.')).toBeInTheDocument()
    expect(followUp).toHaveValue('Make the hierarchy clearer')
  })

  it('confirms a completed export in the workspace', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.exportRevision).mockResolvedValueOnce({ canceled: false, filePath: 'C:\\Exports\\calm-dashboard.zip' })
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Export ready.')
    expect(screen.getByText('C:\\Exports\\calm-dashboard.zip')).toBeInTheDocument()
  })

  it('renames a design inline and updates its workspace title', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: 'Rename design' }))
    const title = screen.getByRole('textbox', { name: 'Rename design' })
    fireEvent.change(title, { target: { value: 'Clear signals' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(bridge.workspace.renameDesign).toHaveBeenCalledWith('design-1', 'Clear signals'))
    expect(await screen.findByRole('heading', { name: 'Clear signals' })).toBeInTheDocument()
  })

  it('selects the provider, model, and effort from the composer settings menu', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.providers.discover).mockResolvedValue([{
      id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [{
        id: 'gpt-5.6', name: 'GPT-5.6', effortLevels: [
          { id: 'low', name: 'Low', isDefault: false },
          { id: 'high', name: 'High', isDefault: true },
        ],
      }, {
        id: 'gpt-5.6-fast', name: 'GPT-5.6 Fast', effortLevels: [
          { id: 'low', name: 'Low', isDefault: true },
          { id: 'high', name: 'High', isDefault: false },
        ],
      }],
    }])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Generation settings' }))
    expect(screen.getByRole('heading', { name: 'Provider' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Model' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Effort' })).toBeInTheDocument()
    expect(screen.queryByText('Provider default')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Codex' }))
    const effort = screen.getByRole('slider', { name: 'Reasoning effort' })
    expect(effort).toHaveAttribute('aria-orientation', 'vertical')
    fireEvent.keyDown(effort, { key: 'End' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'GPT-5.6 Fast' }))
    fireEvent.keyDown(effort, { key: 'Escape' })
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A precise dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('A precise dashboard', 'codex', 'gpt-5.6-fast', 'high', null))
  })

  it('opens the project context menu and uses a chosen local folder', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.chooseProjectFolder).mockResolvedValue('C:\\Projects\\Aurora')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Standalone design/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose local project folder…' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Aurora/ })).toBeInTheDocument())
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A linked dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('A linked dashboard', 'mock', 'mock-v1', undefined, { sourceProjectPath: 'C:\\Projects\\Aurora' }))
  })

  it('offers only linked projects as reuse targets in the composer selector', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([
      { id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page' },
      { id: 'solo', name: 'Solo idea', kind: 'standalone', sourceProjectPath: null, sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Solo idea', latestPrompt: 'A solo idea' },
    ])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /Standalone design/ }))
    expect(screen.getByRole('menuitem', { name: 'Aurora' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Solo idea' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Aurora' }))
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A companion settings screen' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('A companion settings screen', 'mock', 'mock-v1', undefined, { projectId: 'aurora' }))
  })

  it('suggests a linked project when a standalone prompt names it', async () => {
    const createdDesign: OmniDesignDocument = { ...design, id: 'new-design', projectId: 'new-project', projectName: 'New design', title: 'New design' }
    const associatedDesign: OmniDesignDocument = { ...createdDesign, projectId: 'aurora', projectName: 'Aurora' }
    const bridge = installBridge([], createdDesign)
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{
      id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1,
      createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page',
    }])
    vi.mocked(bridge.workspace.associateDesign).mockResolvedValue(associatedDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'Create a dashboard for Aurora' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    expect(await screen.findByText('Possible project match: Aurora.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Associate project' }))
    await waitFor(() => expect(bridge.workspace.associateDesign).toHaveBeenCalledWith('new-design', 'aurora'))
    expect(await screen.findByText('Design associated with Aurora.')).toBeInTheDocument()
  })

  it('can associate a suggested project and restart queued work with its context', async () => {
    const queuedJob: GenerationJob = { id: '7e3670bd-2f6c-444d-afd0-a26e178399664', designId: 'new-design', prompt: 'Create a dashboard for Aurora', providerId: 'mock', modelId: 'mock-v1', state: 'queued', createdAt: '2026-07-20T10:00:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [] }
    const createdDesign: OmniDesignDocument = { ...design, id: 'new-design', projectId: 'new-project', projectName: 'New design', title: 'New design', generationJobs: [queuedJob] }
    const bridge = installBridge([], createdDesign)
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page' }])
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'Create a dashboard for Aurora' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    fireEvent.click(await screen.findByRole('button', { name: 'Associate and restart' }))
    await waitFor(() => expect(bridge.workspace.associateAndRestart).toHaveBeenCalledWith('new-design', 'aurora'))
  })

  it('pre-fills the composer target from a project row add button', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(design), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Calm dashboard' }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'New design in Calm dashboard' }))
    const composer = await screen.findByRole('region', { name: 'Create a design' })
    await waitFor(() => expect(within(composer).getByRole('button', { name: /Calm dashboard/ })).toBeInTheDocument())
    const prompt = within(composer).getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'Another screen' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('Another screen', 'mock', 'mock-v1', undefined, { projectId: 'project-1' }))
  })

  it('keeps the native preview visible while revision history stays in the conversation-side toolbar', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })

    fireEvent.click(screen.getByRole('button', { name: /History/ }))
    expect(screen.getByLabelText('Revision history')).toBeInTheDocument()
    expect(bridge.preview.show).toHaveBeenCalled()
    expect(bridge.preview.hide).not.toHaveBeenCalled()
  })

  it('attaches references to the first generation', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.chooseAttachments).mockResolvedValue([{
      id: '123e4567-e89b-42d3-a456-426614174000', name: 'reference.pdf', path: 'C:\\references\\reference.pdf', kind: 'file', size: 42, modifiedAt: '2026-07-22T12:00:00.000Z', selectedAt: '2026-07-22T12:00:00.000Z', status: 'available',
    }])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Attach files or folders' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Choose files…' }))
    expect(await screen.findByText('reference.pdf')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'What would you like to design?' }), { target: { value: 'Use this reference' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create design' }))

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('Use this reference', 'mock', 'mock-v1', undefined, null, [{
      id: '123e4567-e89b-42d3-a456-426614174000', name: 'reference.pdf', path: 'C:\\references\\reference.pdf', kind: 'file', size: 42, modifiedAt: '2026-07-22T12:00:00.000Z', selectedAt: '2026-07-22T12:00:00.000Z', status: 'available',
    }]))
    expect(bridge.workspace.chooseAttachments).toHaveBeenCalledWith('files')
  })

  it('uses the shared project chooser for associating a standalone design', async () => {
    installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })

    fireEvent.click(screen.getByRole('button', { name: 'Associate' }))
    expect(screen.getByRole('menuitem', { name: 'Choose local project folder…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clone Git repository…' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Standalone design' })).not.toBeInTheDocument()
  })

  it('does not offer association controls for a design already in a linked project', async () => {
    const linkedDesign: OmniDesignDocument = { ...design, sourceProjectPath: 'C:\\Projects\\Calm dashboard' }
    installBridge([linkedDesign], linkedDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    await screen.findByRole('region', { name: 'Design conversation' })
    expect(screen.queryByRole('button', { name: 'Associate' })).not.toBeInTheDocument()
  })


  it('shows revision thumbnails in history', async () => {
    const thumbnailDesign: OmniDesignDocument = {
      ...design,
      revisions: [{ ...design.revisions[0], thumbnailDataUrl: 'data:image/png;base64,iVBORw==' }],
    }
    installBridge([], thumbnailDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })
    fireEvent.click(screen.getByRole('button', { name: /History/ }))

    expect(screen.getByRole('img', { name: 'Preview of revision current head' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw==')
  })

  it('shows the selected revision diagnostic count in the preview status', async () => {
    const diagnosticDesign: OmniDesignDocument = {
      ...design,
      revisions: [{ ...design.revisions[0], diagnostics: [{
        id: 'diagnostic-1', kind: 'runtime', level: 'error', message: 'Uncaught TypeError', source: null, line: 8, createdAt: '2026-07-20T10:01:00.000Z',
      }] }],
    }
    installBridge([], diagnosticDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    expect(await screen.findByText('1 diagnostic captured')).toBeInTheDocument()
  })

  it('lists retained issues in global diagnostics and opens their revision', async () => {
    const diagnosticDesign: OmniDesignDocument = {
      ...design,
      revisions: [{ ...design.revisions[0], diagnostics: [{
        id: 'diagnostic-1', kind: 'runtime', level: 'error', message: 'Uncaught TypeError', source: 'index.html', line: 8, createdAt: '2026-07-20T10:01:00.000Z',
      }] }],
    }
    const bridge = installBridge([diagnosticDesign], diagnosticDesign)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Diagnostics' }))
    expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
    expect(screen.getByText('Preview runtime issue')).toBeInTheDocument()
    expect(screen.getByText('Uncaught TypeError')).toBeInTheDocument()
    expect(screen.getByText(/index\.html:8/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Preview runtime issue/ }))
    await screen.findByRole('region', { name: 'Design conversation' })
    expect(bridge.workspace.get).toHaveBeenCalledWith('design-1')
  })

  it('keeps an invalid candidate inspectable in the conversation', async () => {
    const failedDesign: OmniDesignDocument = {
      ...design,
      invalidCandidates: [{ id: 'candidate-1', prompt: 'Unsafe change', html: '<script>bad()</script>', diagnostic: 'Generated design contains unsafe code.', createdAt: '2026-07-20T10:01:00.000Z' }],
    }
    installBridge([], failedDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Latest candidate was not activated')
    expect(screen.getByText('Technical details')).toBeInTheDocument()
  })

  it('resizes the workspace with its keyboard-operable divider', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    const divider = await screen.findByRole('separator', { name: 'Resize conversation and preview panels' })
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '45')
    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', { conversationWidth: 45, mode: 'split' }))
  })

  it('switches to a conversation-only layout and hides the preview', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Conversation only' }))

    expect(screen.queryByRole('region', { name: 'Generated design preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', { conversationWidth: 43, mode: 'conversation' }))
  })

  it('switches to a preview-only layout and hides the conversation', async () => {
    installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })

    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview only' }))

    expect(screen.queryByRole('region', { name: 'Design conversation' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
  })

  it('pops the preview into a separate window and offers to dock it', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pop out preview' }))

    await waitFor(() => expect(bridge.preview.popOut).toHaveBeenCalledWith({ designId: 'design-1', revisionId: 'revision-1' }))
    expect(screen.queryByRole('region', { name: 'Generated design preview' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dock preview' }))
    expect(await screen.findByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
  })

  it('freezes and suspends the native preview layer while a header overlay covers it', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: /History/ }))
    await waitFor(() => expect(bridge.preview.freeze).toHaveBeenCalled())
    await waitFor(() => expect(bridge.preview.setSuspended).toHaveBeenCalledWith(true))
    // Selecting a revision closes the React Aria menu, which restores the live preview layer.
    fireEvent.click(screen.getByRole('menuitem', { name: /Current head/ }))
    expect(bridge.workspace.selectRevision).not.toHaveBeenCalled()
    await waitFor(() => expect(bridge.preview.setSuspended).toHaveBeenLastCalledWith(false))
  })

  it('suspends the native preview through the shared dropdown behavior for generation settings', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: 'Generation settings' }))
    await waitFor(() => expect(bridge.preview.setSuspended).toHaveBeenCalledWith(true))
  })

  it('recovers saved designs into the home list', async () => {
    installBridge([design])
    render(<App />)

    expect(await screen.findAllByText('Calm dashboard')).not.toHaveLength(0)
    expect(screen.getByText(/A calm dashboard/)).toBeInTheDocument()
  })

  it('uses the persisted thumbnail in the recent-design row', async () => {
    installBridge([{ ...design, thumbnailDataUrl: 'data:image/png;base64,iVBORw==' }])
    render(<App />)

    expect(await screen.findByRole('img', { name: 'Preview of Calm dashboard' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw==')
  })

  it('lets the user choose and persist the trusted application theme', async () => {
    const bridge = installBridge()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(bridge.settings.saveTheme).toHaveBeenCalledWith('light')
  })

  it('offers a retry for a stopped generation without replacing its current revision', async () => {
    const interruptedDesign: OmniDesignDocument = {
      ...design,
      generationJobs: [{
        id: 'e0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'Try again', providerId: 'mock', modelId: 'mock-v1', state: 'interrupted',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: '2026-07-20T10:01:02.000Z', error: 'OmniDesign closed before this generation completed.', attachments: [],
      }],
    }
    const bridge = installBridge([], interruptedDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(bridge.workspace.retryGeneration).toHaveBeenCalledWith('e0684c4c-0d07-4ece-9d6f-22c2f523e399')
  })

  it('opens a single-design project straight into its workspace', async () => {
    const bridge = installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    vi.mocked(bridge.preview.hide).mockClear()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Calm dashboard' }))
    expect(bridge.preview.hide).not.toHaveBeenCalled()
  })

  it('lets the user disable system notifications', async () => {
    const bridge = installBridge()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const notifications = await screen.findByRole('switch', { name: 'System notifications' })
    expect(notifications).toBeChecked()
    fireEvent.click(notifications)
    expect(bridge.settings.saveNotificationsEnabled).toHaveBeenCalledWith(false)
  })

  it('keeps supplied references visible with the submitted conversation message', async () => {
    const attachedDesign: OmniDesignDocument = {
      ...design,
      messages: [{ ...design.messages[0], attachments: [{
        id: '123e4567-e89b-42d3-a456-426614174000', name: 'reference.pdf', path: 'C:\\references\\reference.pdf', kind: 'file', size: 42, modifiedAt: '2026-07-22T12:00:00.000Z', selectedAt: '2026-07-22T12:00:00.000Z', status: 'available',
      }] }],
    }
    const bridge = installBridge([attachedDesign], attachedDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    const references = await screen.findByLabelText('References supplied with this prompt')
    expect(references).toHaveTextContent('reference.pdf')
    fireEvent.click(within(references).getByRole('button', { name: 'reference.pdf' }))
    expect(bridge.workspace.openAttachment).toHaveBeenCalledWith(attachedDesign.messages[0].attachments![0])
    expect(bridge.workspace.get).not.toHaveBeenCalled()
  })

  it('expands a project in the sidebar to open a specific design', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    const bridge = installBridge([first, second])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(first), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Studio', designCount: 2 }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Expand Studio' }))
    const sublist = await within(sidebar).findByRole('group', { name: 'Studio designs' })
    fireEvent.click(within(sublist).getByRole('button', { name: 'Settings screen' }))

    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
  })

  it('opens a multi-design project to its design grid and into a chosen design', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    const bridge = installBridge([first, second])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(first), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Studio', designCount: 2 }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Studio' }))

    const grid = await screen.findByRole('group', { name: 'Designs in this project' })
    fireEvent.click(within(grid).getByRole('button', { name: 'Open Settings screen' }))
    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
  })

  it('renames a design without opening it from a multi-design project card', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    const bridge = installBridge([first, second])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(first), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Studio', designCount: 2 }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Studio' }))
    const grid = await screen.findByRole('group', { name: 'Designs in this project' })
    fireEvent.click(within(grid).getByRole('button', { name: 'Rename Settings screen design' }))
    const title = within(grid).getByRole('textbox', { name: 'Rename Settings screen design' })
    fireEvent.change(title, { target: { value: 'Preferences' } })
    fireEvent.submit(title.closest('form')!)

    await waitFor(() => expect(bridge.workspace.renameDesign).toHaveBeenCalledWith('design-2', 'Preferences'))
    expect(await screen.findByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Design conversation' })).not.toBeInTheDocument()
  })

  it('keeps standalone designs as direct sidebar entries without expansion or an add button', async () => {
    installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    await within(sidebar).findByRole('button', { name: 'Calm dashboard' })
    expect(within(sidebar).queryByRole('button', { name: 'Expand Calm dashboard' })).not.toBeInTheDocument()
    expect(within(sidebar).queryByRole('button', { name: 'New design in Calm dashboard' })).not.toBeInTheDocument()
  })
})
