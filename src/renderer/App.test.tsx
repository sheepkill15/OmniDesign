import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { promptMentionsProject } from './promptMatch'

describe('promptMentionsProject', () => {
  it('matches a linked project only as a word-bounded, non-trivial phrase', () => {
    expect(promptMentionsProject('Add a settings page to Acme Portal', 'Acme Portal')).toBe(true)
    expect(promptMentionsProject('redesign the acme portal header', 'Acme Portal')).toBe(true)
    // No substring false positives, and very short names are ignored.
    expect(promptMentionsProject('scaffold a new app shell', 'app')).toBe(false)
    expect(promptMentionsProject('a portalgun for the demo', 'Portal')).toBe(false)
  })
})

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
  titlePending: false,
  adaptationPending: false,
  entryPagePath: null,
  pages: [],
  tags: [],
  lastSelection: { providerId: 'mock', modelId: 'mock-v1', effort: null },
  generationSteps: [],
  layout: { conversationWidth: 43, mode: 'split', previewViewMode: 'focused', previewFit: 'artboard', previewDevice: 'desktop', previewCustomWidth: 1280, previewCustomHeight: 800, previewPage: null, previewZoom: 0.75, previewPanX: 0, previewPanY: 0 },
  messages: [{ id: 'message-1', role: 'user', text: 'A calm dashboard', createdAt: '2026-07-20T10:00:00.000Z' }],
  invalidCandidates: [],
  generationJobs: [],
  revisions: [{ id: 'revision-1', parentRevisionId: null, prompt: 'A calm dashboard', providerId: 'mock', modelId: 'mock-v1', qualityCheckedAt: '2026-07-20T10:00:02.000Z', qualityCheckVersion: 1, createdAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, diagnostics: [] }],
}

const engagedDesign: OmniDesignDocument = {
  ...design,
  updatedAt: '2026-07-20T10:05:00.000Z',
  activeRevisionId: 'revision-2',
  selectedRevisionId: 'revision-2',
  messages: [
    ...design.messages,
    { id: 'message-2', role: 'user', text: 'Make the overview more compact', createdAt: '2026-07-20T10:04:00.000Z' },
  ],
  revisions: [
    ...design.revisions,
    { id: 'revision-2', parentRevisionId: 'revision-1', prompt: 'Make the overview more compact', providerId: 'mock', modelId: 'mock-v1', qualityCheckedAt: '2026-07-20T10:05:02.000Z', qualityCheckVersion: 1, createdAt: '2026-07-20T10:05:00.000Z', thumbnailDataUrl: null, diagnostics: [] },
  ],
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
    lastProviderId: candidate.lastSelection.providerId,
    folderId: null,
    tags: [],
    currentDefinitionVersion: 1,
    definitionPromptSuppressed: false,
  }
}

function installBridge(initialDesigns: OmniDesignDocument[] = [], createdDesign: OmniDesignDocument = design) {
  const listeners: Array<(activity: GenerationActivity) => void> = []
  const changeListeners: Array<(event: { readonly designId: string }) => void> = []
  const providerListeners: Array<(providers: readonly ProviderStatus[]) => void> = []
  const projectMap = new Map<string, ProjectSummary>()
  for (const candidate of initialDesigns) {
    const existing = projectMap.get(candidate.projectId)
    projectMap.set(candidate.projectId, existing ? { ...existing, designCount: existing.designCount + 1 } : projectFromDesign(candidate))
  }
  const projects = [...projectMap.values()]
  const bridge = {
    providers: {
      getCached: vi.fn().mockResolvedValue([
        { id: 'mock', name: 'Development provider', installed: true, authenticated: true, detail: 'Ready', models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }] },
        { id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] },
      ]),
      refresh: vi.fn().mockResolvedValue([
        { id: 'mock', name: 'Development provider', installed: true, authenticated: true, detail: 'Ready', models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }] },
        { id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] },
      ]),
      openSetup: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(),
      onUpdated: vi.fn((listener: (providers: readonly ProviderStatus[]) => void) => { providerListeners.push(listener); return () => undefined }),
      onActivity: vi.fn().mockReturnValue(() => undefined),
    },
    environment: {
      platform: 'win32',
      discover: vi.fn().mockResolvedValue([{
        id: 'git', name: 'Git', installed: true, required: true, detail: 'git version 2.55.0 is available for design history and project cloning.',
      }]),
      openSetup: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      list: vi.fn().mockResolvedValue(initialDesigns),
      listProjects: vi.fn().mockResolvedValue(projects),
      getProject: vi.fn(async (projectId: string) => {
        const project = projects.find((candidate) => candidate.id === projectId)
        return project ? { project, designs: initialDesigns.filter((candidate) => candidate.projectId === projectId) } : null
      }),
      getProjectDesignDefinitions: vi.fn().mockResolvedValue({ current: null, promptSuppressed: false }),
      saveProjectDesignDefinitions: vi.fn(async (projectId: string, definitions: ProjectDesignDefinitions) => ({ id: '4ecde3a1-3d43-4db9-a8f4-6da2c8d8d5ab', projectId, version: 1, definitions, createdAt: '2026-07-20T10:00:00.000Z' })),
      proposeProjectDesignDefinitions: vi.fn().mockResolvedValue({ schemaVersion: 1, colors: [{ name: 'primary', value: '#4b3b47', description: 'Primary actions' }], typography: [], spacing: [], shape: [], visualGuidance: 'Calm and cohesive.', aiAgentInstructions: 'Reuse semantic tokens.' }),
      setProjectDefinitionPromptSuppressed: vi.fn().mockResolvedValue({ current: null, promptSuppressed: true }),
      keepProjectDesignDefinitions: vi.fn(async (designId: string, targetVersion: number) => ({ ...(initialDesigns.find((candidate) => candidate.id === designId) ?? createdDesign), pendingDefinitionVersion: null, keptDefinitionVersion: targetVersion, definitionApplicationState: 'kept' as const })),
      applyProjectDesignDefinitions: vi.fn(async (designId: string, targetVersion: number) => ({ ...(initialDesigns.find((candidate) => candidate.id === designId) ?? createdDesign), definitionVersion: targetVersion, pendingDefinitionVersion: null, definitionApplicationState: 'current' as const })),
      applyProjectDesignDefinitionsToAll: vi.fn(async (_projectId: string, targetVersion: number) => initialDesigns.map((candidate) => ({ ...candidate, definitionVersion: targetVersion, pendingDefinitionVersion: null, definitionApplicationState: 'current' as const }))),
      listTrash: vi.fn().mockResolvedValue([]),
      listFolders: vi.fn().mockResolvedValue([]),
      listTags: vi.fn().mockResolvedValue([]),
      createFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'Folder', parentFolderId: null, sortOrder: 0, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z' }),
      renameFolder: vi.fn().mockResolvedValue(undefined),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
      moveProjectToFolder: vi.fn().mockResolvedValue(undefined),
      createTag: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'Tag', color: 'neutral', createdAt: '2026-07-20T10:00:00.000Z' }),
      deleteTag: vi.fn().mockResolvedValue(undefined),
      tag: vi.fn().mockResolvedValue(undefined),
      untag: vi.fn().mockResolvedValue(undefined),
      duplicateDesign: vi.fn().mockResolvedValue(createdDesign),
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
      listFocusedFeedback: vi.fn().mockResolvedValue([]),
      queueFocusedFeedback: vi.fn().mockResolvedValue([]),
      removeFocusedFeedback: vi.fn().mockResolvedValue([]),
      submitFocusedFeedbackBatch: vi.fn().mockResolvedValue(design),
      chooseProjectFolder: vi.fn().mockResolvedValue(null),
      chooseAttachments: vi.fn().mockResolvedValue([]),
      openAttachment: vi.fn().mockResolvedValue(undefined),
      cancelGeneration: vi.fn().mockResolvedValue(undefined),
      removeGeneration: vi.fn().mockResolvedValue(undefined),
      retryGeneration: vi.fn().mockResolvedValue(undefined),
      continueGeneration: vi.fn().mockResolvedValue(undefined),
      resumeGenerationQueue: vi.fn().mockResolvedValue(design),
      selectRevision: vi.fn().mockResolvedValue(design),
      compareRevisions: vi.fn().mockResolvedValue({ baseRevisionId: 'revision-1', targetRevisionId: 'revision-2', files: [], additions: 0, deletions: 0 }),
      restoreRevision: vi.fn().mockResolvedValue(design),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      saveLayout: vi.fn().mockResolvedValue(undefined),
      exportRevision: vi.fn().mockResolvedValue({ canceled: true }),
      revisionPages: vi.fn().mockResolvedValue({ pages: [], entryPagePath: null }),
      setEntryPage: vi.fn().mockResolvedValue(design),
      savePageMetadata: vi.fn().mockResolvedValue(design),
      onActivity: vi.fn((listener: (activity: GenerationActivity) => void) => { listeners.push(listener); return () => undefined }),
      onChanged: vi.fn((listener: (event: { readonly designId: string }) => void) => { changeListeners.push(listener); return () => undefined }),
      onCloneActivity: vi.fn().mockReturnValue(() => undefined),
    },
    preview: {
      register: vi.fn().mockResolvedValue({ token: 'token-1', pages: [{ path: 'index.html', title: null, order: 0, isHome: true }], entryPagePath: 'index.html' }),
      resolveFocusedTarget: vi.fn().mockResolvedValue(null),
      locateFocusedTargets: vi.fn(async (request: { targets: readonly { id: string; target: FocusedTarget }[] }) => request.targets.flatMap(({ id, target }) => target.locationId ? [{ id, locationId: target.locationId }] : [])),
      reportDiagnostic: vi.fn().mockResolvedValue(undefined),
      capture: vi.fn().mockResolvedValue(true),
      popOut: vi.fn().mockResolvedValue(undefined),
      closePopOut: vi.fn().mockResolvedValue(undefined),
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
      getLastOpenDesignId: vi.fn().mockResolvedValue(null),
      saveLastOpenDesignId: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Window['omnidesign']
  Object.defineProperty(window, 'omnidesign', { value: bridge, configurable: true })
  return Object.assign(bridge, {
    emitWorkspaceActivity(activity: GenerationActivity) {
      for (const listener of listeners) listener(activity)
    },
    emitWorkspaceChanged(designId: string) {
      for (const listener of changeListeners) listener({ designId })
    },
    emitProvidersUpdated(providers: readonly ProviderStatus[]) {
      for (const listener of providerListeners) listener(providers)
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

  it('retains the shell and offers retry when the local workspace cannot refresh', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.list).mockRejectedValueOnce(new Error('Workspace database is unavailable.'))
    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Workspace refresh failed')
    expect(alert).toHaveTextContent('Workspace database is unavailable.')
    expect(screen.getByRole('heading', { name: 'Start with an idea.' })).toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText('Workspace refresh failed')).not.toBeInTheDocument())
    expect(bridge.workspace.list).toHaveBeenCalledTimes(2)
  })

  it('keeps project access available while generation waits for a provider', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.providers.refresh).mockResolvedValue([])
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

  it('reopens the last-open design on launch and keeps persisting which design is open', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    vi.mocked(bridge.workspace.get).mockResolvedValue(design)
    render(<App />)

    // Restored straight into the design workspace rather than Home.
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument()
    // Leaving the design back to Home records that nothing is open now.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(bridge.settings.saveLastOpenDesignId).toHaveBeenCalledWith(null))
  })

  it('starts on Home and clears the stored id when the last-open design is gone', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue('deleted-design')
    vi.mocked(bridge.workspace.get).mockResolvedValue(null)
    render(<App />)

    expect(await screen.findByRole('textbox', { name: 'What would you like to design?' })).toBeInTheDocument()
    await waitFor(() => expect(bridge.settings.saveLastOpenDesignId).toHaveBeenCalledWith(null))
  })

  it('opens a project from the shared design collection without a per-project fetch', async () => {
    const secondDesign = { ...design, id: 'design-2', title: 'Calm settings' }
    const bridge = installBridge([design, secondDesign])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    expect(await screen.findByRole('group', { name: 'Designs in this project' })).toBeInTheDocument()
    expect(bridge.workspace.getProject).not.toHaveBeenCalled()
  })

  it('reports project-page action failures without leaving the project', async () => {
    const secondDesign = { ...design, id: 'design-2', title: 'Calm settings' }
    const bridge = installBridge([design, secondDesign])
    vi.mocked(bridge.workspace.trash).mockRejectedValueOnce(new Error('Trash is temporarily locked.'))
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove project' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The project could not be moved to Trash. Trash is temporarily locked.')
    expect(screen.getByRole('textbox', { name: 'Rename project' })).toHaveValue('Calm dashboard')
  })

  it('preserves a follow-up draft when its previous provider is unavailable', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.providers.refresh).mockResolvedValue([])
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

    await waitFor(() => expect(bridge.providers.getCached).toHaveBeenCalledOnce())
    await waitFor(() => expect(bridge.providers.refresh).toHaveBeenCalledTimes(3))
  })

  it('guides missing and signed-out providers through their official CLI setup', async () => {
    const bridge = installBridge()
    const unavailableProviders: ProviderStatus[] = [
      { id: 'codex', name: 'Codex', installed: false, authenticated: false, detail: 'Codex CLI is unavailable.', models: [] },
      { id: 'claude', name: 'Claude', installed: true, authenticated: false, detail: 'Installed, but not signed in.', models: [] },
    ]
    vi.mocked(bridge.providers.getCached).mockResolvedValue(unavailableProviders)
    vi.mocked(bridge.providers.refresh).mockResolvedValue(unavailableProviders)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up Codex CLI' }))

    const codexDialog = screen.getByRole('dialog', { name: 'Set up Codex' })
    expect(codexDialog).toHaveTextContent('npm install --global @openai/codex')
    expect(codexDialog).toHaveTextContent('codex login')
    fireEvent.click(screen.getByRole('button', { name: 'Open official guide' }))
    await waitFor(() => expect(bridge.providers.openSetup).toHaveBeenCalledWith('codex'))

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up Codex' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Claude Code' }))
    const claudeDialog = screen.getByRole('dialog', { name: 'Sign in to Claude' })
    expect(claudeDialog).not.toHaveTextContent('winget install Anthropic.ClaudeCode')
    expect(claudeDialog).toHaveTextContent('claude')
  })

  it('checks Git quietly and offers setup only when the local tool is missing', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.environment.discover).mockResolvedValue([{
      id: 'git', name: 'Git', installed: false, required: true, detail: 'Git is required but unavailable.',
    }])
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))
    expect(await screen.findByRole('heading', { name: 'Local tools' })).toBeInTheDocument()
    expect(screen.getByText('Missing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up Git' }))

    const dialog = screen.getByRole('dialog', { name: 'Set up Git' })
    expect(dialog).toHaveTextContent('winget install --id Git.Git -e --source winget')
    expect(dialog).toHaveTextContent('does not install Git or change your Git configuration')
    fireEvent.click(screen.getByRole('button', { name: 'Open official guide' }))
    await waitFor(() => expect(bridge.environment.openSetup).toHaveBeenCalledWith('git'))
  })

  it('renders cached providers while their background refresh is still running', async () => {
    const bridge = installBridge()
    let finishRefresh: ((providers: ProviderStatus[]) => void) | undefined
    const refresh = new Promise<ProviderStatus[]>((resolve) => { finishRefresh = resolve })
    vi.mocked(bridge.providers.getCached).mockResolvedValue([{
      id: 'codex', name: 'Cached Codex', installed: true, authenticated: true, detail: 'Ready from cache',
      models: [{ id: 'cached-model', name: 'Cached model', effortLevels: [] }],
    }])
    vi.mocked(bridge.providers.refresh).mockReturnValue(refresh)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))
    expect(await screen.findByText('Cached Codex')).toBeInTheDocument()
    expect(screen.queryByText('No provider availability information is available.')).not.toBeInTheDocument()

    act(() => bridge.emitProvidersUpdated([{
      id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Fresh status',
      models: [{ id: 'sonnet', name: 'Sonnet', effortLevels: [] }],
    }]))
    expect(await screen.findByText('Claude')).toBeInTheDocument()
    act(() => finishRefresh?.([{
      id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Fresh status',
      models: [{ id: 'sonnet', name: 'Sonnet', effortLevels: [] }],
    }]))
  })

  it('shows provider discovery progress instead of a false unavailable state on an empty first-run cache', async () => {
    const bridge = installBridge()
    let finishRefresh: ((providers: ProviderStatus[]) => void) | undefined
    vi.mocked(bridge.providers.getCached).mockResolvedValue([])
    vi.mocked(bridge.providers.refresh).mockReturnValue(new Promise((resolve) => { finishRefresh = resolve }))
    render(<App />)

    expect(await screen.findByText('Checking local providers…')).toBeInTheDocument()
    expect(screen.queryByText('Connect a provider to start generating.')).not.toBeInTheDocument()
    act(() => finishRefresh?.([]))
    expect(await screen.findByText('Connect a provider to start generating.')).toBeInTheDocument()
  })

  it('explains provider discovery failures without hiding the development provider', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.providers.refresh).mockRejectedValue(new Error('Provider tools could not be queried.'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider availability could not be refreshed.')
    expect(screen.getByRole('alert')).toHaveTextContent('Provider tools could not be queried.')
    expect(screen.getByText('Development provider')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(bridge.workspace.resumeGenerationQueue).toHaveBeenCalledWith('design-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(bridge.workspace.removeGeneration).toHaveBeenCalledWith('7e3670bd-2f6c-444d-afd0-a26e17839964'))
  })

  it('offers an explicit resume action for a paused queue without a failed predecessor', async () => {
    const queuedDesign: OmniDesignDocument = {
      ...design,
      queuePaused: true,
      generationJobs: [{
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Queued across restart', providerId: 'mock', modelId: 'mock-v1', state: 'queued',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [],
      }],
    }
    const bridge = installBridge([queuedDesign], queuedDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume queue' }))

    expect(bridge.workspace.resumeGenerationQueue).toHaveBeenCalledWith('design-1')
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('keeps failed global generation actions visible and retryable', async () => {
    const queuedDesign: OmniDesignDocument = {
      ...design,
      generationJobs: [{
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Remove me', providerId: 'mock', modelId: 'mock-v1', state: 'queued',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [],
      }],
    }
    const bridge = installBridge([queuedDesign], queuedDesign)
    vi.mocked(bridge.workspace.removeGeneration).mockRejectedValueOnce(new Error('Database is busy.'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Generations/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Generation action failed.')
    expect(screen.getByRole('alert')).toHaveTextContent('Database is busy.')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
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

  it('keeps running work stoppable while exposing queued prompts separately', async () => {
    const runningId = '11111111-1111-4111-8111-111111111111'
    const queuedId = '22222222-2222-4222-8222-222222222222'
    const queuedDesign: OmniDesignDocument = {
      ...design,
      generationJobs: [
        { id: runningId, designId: design.id, prompt: 'Refine the hierarchy', providerId: 'codex', modelId: 'gpt-5.6', state: 'running', attachments: [], createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: null, error: null },
        { id: queuedId, designId: design.id, prompt: 'Then warm the palette', providerId: 'claude', modelId: 'sonnet', state: 'queued', attachments: [], createdAt: '2026-07-20T10:02:00.000Z', startedAt: null, completedAt: null, error: null },
      ],
    }
    const bridge = installBridge([queuedDesign], queuedDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    await act(async () => bridge.emitWorkspaceActivity({ designId: design.id, stage: 'generating', detail: 'Editing the page' }))
    const queue = await screen.findByRole('region', { name: 'Queued prompts' })
    expect(queue).toHaveTextContent('Then warm the palette')
    fireEvent.click(within(queue).getByRole('button', { name: 'Remove' }))
    expect(bridge.workspace.removeGeneration).toHaveBeenCalledWith(queuedId)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(bridge.workspace.cancelGeneration).toHaveBeenCalledWith(runningId)
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

  it('keeps the initial draft and explains when design creation fails', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.create).mockRejectedValueOnce(new Error('Git executable is unavailable.'))
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    expect(await screen.findByRole('alert')).toHaveTextContent('The design could not be created. Git executable is unavailable.')
    expect(prompt).toHaveValue('A calm dashboard')
    expect(screen.getByRole('region', { name: 'Create a design' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Git setup guide' }))
    expect(bridge.environment.openSetup).toHaveBeenCalledWith('git')
    expect(prompt).toHaveValue('A calm dashboard')
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
    expect(bridge.preview.closePopOut).not.toHaveBeenCalled()
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
    const title = await screen.findByRole('textbox', { name: 'Rename design' })
    fireEvent.focus(title)
    fireEvent.change(title, { target: { value: 'Clear signals' } })
    fireEvent.blur(title)

    await waitFor(() => expect(bridge.workspace.renameDesign).toHaveBeenCalledWith('design-1', 'Clear signals'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Rename design' })).toHaveValue('Clear signals'))
  })

  it('refreshes an open workspace when its background-generated title arrives', async () => {
    const bridge = installBridge([design], design)
    const generatedTitle = { ...design, title: 'Quiet metrics' }
    vi.mocked(bridge.workspace.get).mockResolvedValue(generatedTitle)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    await act(async () => bridge.emitWorkspaceChanged(design.id))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Rename design' })).toHaveValue('Quiet metrics'))
  })

  it('selects the provider, model, and effort from the composer settings menu', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.providers.refresh).mockResolvedValue([{
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

  it('keeps the first completed result visible instead of interrupting it with definition setup', async () => {
    const bridge = installBridge([design], design)
    const project = { ...projectFromDesign(design), currentDefinitionVersion: null }
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([project])
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Set up design definitions/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Definitions' })).toBeInTheDocument()
  })

  it('offers design-definition setup after the user has iterated and can hide the prompt permanently', async () => {
    const bridge = installBridge([engagedDesign], engagedDesign)
    const project = { ...projectFromDesign(engagedDesign), currentDefinitionVersion: null }
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([project])
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(engagedDesign.id)
    render(<App />)

    const dialog = await screen.findByRole('dialog', { name: 'Set up design definitions for Calm dashboard?' })
    expect(within(dialog).getByText(/shared colors, typography, spacing, shape/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Set up now' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: "Don't show again for this project" }))

    await waitFor(() => expect(bridge.workspace.setProjectDefinitionPromptSuppressed).toHaveBeenCalledWith('project-1', true))
    expect(screen.queryByRole('dialog', { name: /Set up design definitions/ })).not.toBeInTheDocument()
  })

  it('offers proposal, manual, and continue setup paths and starts the chosen proposal for review', async () => {
    const bridge = installBridge([engagedDesign], engagedDesign)
    const project = { ...projectFromDesign(engagedDesign), currentDefinitionVersion: null }
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([project])
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(engagedDesign.id)
    vi.mocked(bridge.settings.getTheme).mockResolvedValue('light')
    render(<App />)

    const prompt = await screen.findByRole('dialog', { name: 'Set up design definitions for Calm dashboard?' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    const setupButton = within(prompt).getByRole('button', { name: 'Set up now' })
    fireEvent.keyDown(setupButton, { key: 'Enter' })
    fireEvent.keyUp(setupButton, { key: 'Enter' })
    const chooser = await screen.findByRole('dialog', { name: 'Choose how to set up Calm dashboard' })
    expect(within(chooser).getByRole('button', { name: 'Fill in manually' })).toBeInTheDocument()
    expect(within(chooser).getByRole('button', { name: 'Continue without definitions' })).toBeInTheDocument()
    const proposalButton = within(chooser).getByRole('button', { name: 'Generate a proposal' })
    fireEvent.keyDown(proposalButton, { key: 'Enter' })
    fireEvent.keyUp(proposalButton, { key: 'Enter' })

    expect(await screen.findByRole('heading', { name: 'Design definitions' })).toBeInTheDocument()
    await waitFor(() => expect(bridge.workspace.proposeProjectDesignDefinitions).toHaveBeenCalledWith('project-1', 'mock', 'mock-v1', null))
    expect(await screen.findByText('Proposal ready for review.')).toBeInTheDocument()
    expect(bridge.workspace.saveProjectDesignDefinitions).not.toHaveBeenCalled()
  })

  it('edits and saves structured project definitions from a design workspace', async () => {
    const bridge = installBridge([design], design)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    vi.mocked(bridge.workspace.getProjectDesignDefinitions).mockResolvedValue({ current: null, promptSuppressed: false })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Definitions' }))
    expect(await screen.findByRole('heading', { name: 'Design definitions' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'primary' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '#725d78' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Primary actions' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Visual guidance' }), { target: { value: 'Quiet and spacious.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'AI Agent instructions' }), { target: { value: 'Use semantic HTML.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save definitions' }))

    await waitFor(() => expect(bridge.workspace.saveProjectDesignDefinitions).toHaveBeenCalledWith('project-1', expect.objectContaining({
      colors: [{ name: 'primary', value: '#725d78', description: 'Primary actions' }],
      visualGuidance: 'Quiet and spacious.',
      aiAgentInstructions: 'Use semantic HTML.',
    })))
    expect(await screen.findByText('Definitions saved.')).toBeInTheDocument()
  })

  it('shows field-level recovery for duplicate names and unsafe CSS values before saving definitions', async () => {
    const bridge = installBridge([design], design)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Definitions' }))
    await screen.findByRole('heading', { name: 'Design definitions' })
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))
    const names = screen.getAllByRole('textbox', { name: 'Name' })
    const values = screen.getAllByRole('textbox', { name: 'Value' })
    fireEvent.change(names[0], { target: { value: 'primary' } })
    fireEvent.change(names[1], { target: { value: 'primary' } })
    fireEvent.change(values[0], { target: { value: '#725d78' } })
    fireEvent.change(values[1], { target: { value: 'red; } body { display: none' } })

    expect(screen.getAllByText(/already used in this section/)).toHaveLength(2)
    expect(screen.getByText(/without semicolons, braces, comments/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save definitions' })).toBeDisabled()
    expect(bridge.workspace.saveProjectDesignDefinitions).not.toHaveBeenCalled()

    fireEvent.change(names[1], { target: { value: 'secondary' } })
    fireEvent.change(values[1], { target: { value: 'oklch(65% 0.12 320)' } })
    expect(screen.getByRole('button', { name: 'Save definitions' })).toBeEnabled()
  })

  it('loads an AI-generated definition proposal for review without saving it', async () => {
    const bridge = installBridge([design], design)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Definitions' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Generate proposal' }))

    await waitFor(() => expect(bridge.workspace.proposeProjectDesignDefinitions).toHaveBeenCalledWith('project-1', 'mock', 'mock-v1', null))
    expect(await screen.findByText('Proposal ready for review.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'AI Agent instructions' })).toHaveValue('Reuse semantic tokens.')
    expect(bridge.workspace.saveProjectDesignDefinitions).not.toHaveBeenCalled()
  })

  it('persists a per-design definition decision and offers applying the version to all designs', async () => {
    const pending = { ...design, definitionVersion: 1, pendingDefinitionVersion: 2, definitionApplicationState: 'pending' as const }
    const bridge = installBridge([pending], pending)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(pending.id)
    render(<App />)

    expect(await screen.findByText('Project definitions version 2 is ready.')).toBeInTheDocument()
    expect(screen.queryByText('Definitions: Pending version 2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all' }))

    await waitFor(() => expect(bridge.workspace.applyProjectDesignDefinitionsToAll).toHaveBeenCalledWith('project-1', 2))
  })

  it('reports recoverable partial apply-to-all results without hiding successful designs', async () => {
    const pending = { ...design, definitionVersion: 1, pendingDefinitionVersion: 2, definitionApplicationState: 'pending' as const }
    const sibling = { ...pending, id: 'design-2', title: 'Settings' }
    const bridge = installBridge([pending, sibling], pending)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(pending.id)
    vi.mocked(bridge.workspace.applyProjectDesignDefinitionsToAll).mockResolvedValueOnce([
      { ...pending, definitionVersion: 2, pendingDefinitionVersion: null, definitionApplicationState: 'current' },
      { ...sibling, definitionApplicationState: 'failed', definitionApplicationError: 'Validation failed.' },
    ])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Apply to all' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 design still needs attention.')
    expect(screen.getByRole('alert')).toHaveTextContent('Successful updates were kept.')
  })

  it('offers only linked projects as reuse targets in the composer selector', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([
      { id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page', lastProviderId: 'mock', folderId: null, tags: [], currentDefinitionVersion: 1, definitionPromptSuppressed: false },
      { id: 'solo', name: 'Solo idea', kind: 'standalone', sourceProjectPath: null, sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Solo idea', latestPrompt: 'A solo idea', lastProviderId: 'mock', folderId: null, tags: [], currentDefinitionVersion: 1, definitionPromptSuppressed: false },
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
    const associatedDesign: OmniDesignDocument = { ...createdDesign, projectId: 'aurora', projectName: 'Aurora', adaptationPending: true }
    const bridge = installBridge([], createdDesign)
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{
      id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1,
      createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page',
      lastProviderId: 'mock', folderId: null, tags: [], currentDefinitionVersion: 1, definitionPromptSuppressed: false,
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

  it('keeps the adapt notice after a move even when a stale generation refresh arrives', async () => {
    // Reproduces moving a design into a project while it is still generating, without leaving it: the
    // move sets adaptationPending, but an in-flight generation refresh (get) that read the design before
    // the move must not clobber the fresher moved state back to "not pending".
    const runningJob: GenerationJob = { id: '7e3670bd-2f6c-444d-afd0-a26e178399664', designId: 'new-design', prompt: 'Create a dashboard for Aurora', providerId: 'mock', modelId: 'mock-v1', state: 'running', createdAt: '2026-07-20T10:00:00.000Z', startedAt: '2026-07-20T10:00:01.000Z', completedAt: null, error: null, attachments: [] }
    const createdDesign: OmniDesignDocument = { ...design, id: 'new-design', projectId: 'new-project', projectName: 'New design', title: 'New design', updatedAt: '2026-07-20T10:00:00.000Z', adaptationPending: false, generationJobs: [runningJob] }
    const movedDesign: OmniDesignDocument = { ...createdDesign, projectId: 'aurora', projectName: 'Aurora', updatedAt: '2026-07-20T10:05:00.000Z', adaptationPending: true }
    const bridge = installBridge([], createdDesign)
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page', lastProviderId: 'mock', folderId: null, tags: [], currentDefinitionVersion: 1, definitionPromptSuppressed: false }])
    vi.mocked(bridge.workspace.associateDesign).mockResolvedValue(movedDesign)
    // A generation refresh that resolves after the move still carries the pre-move snapshot.
    vi.mocked(bridge.workspace.get).mockResolvedValue(createdDesign)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'Create a dashboard for Aurora' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    fireEvent.click(await screen.findByRole('button', { name: 'Associate project' }))
    await waitFor(() => expect(bridge.workspace.associateDesign).toHaveBeenCalledWith('new-design', 'aurora'))
    expect(await screen.findByText('Design associated with Aurora.')).toBeInTheDocument()

    act(() => bridge.emitWorkspaceChanged('new-design'))

    expect(await screen.findByText('Design associated with Aurora.')).toBeInTheDocument()
  })

  it('can associate a suggested project and restart queued work with its context', async () => {
    const queuedJob: GenerationJob = { id: '7e3670bd-2f6c-444d-afd0-a26e178399664', designId: 'new-design', prompt: 'Create a dashboard for Aurora', providerId: 'mock', modelId: 'mock-v1', state: 'queued', createdAt: '2026-07-20T10:00:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [] }
    const createdDesign: OmniDesignDocument = { ...design, id: 'new-design', projectId: 'new-project', projectName: 'New design', title: 'New design', generationJobs: [queuedJob] }
    const bridge = installBridge([], createdDesign)
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ id: 'aurora', name: 'Aurora', kind: 'linked', sourceProjectPath: 'C:\\Projects\\Aurora', sourceAvailable: true, designCount: 1, createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z', thumbnailDataUrl: null, latestDesignTitle: 'Landing', latestPrompt: 'A landing page', lastProviderId: 'mock', folderId: null, tags: [], currentDefinitionVersion: 1, definitionPromptSuppressed: false }])
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

  it('registers the preview and keeps it mounted while revision history opens in the toolbar', async () => {
    const bridge = installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Design conversation' })

    fireEvent.click(screen.getByRole('button', { name: /History/ }))
    expect(screen.getByLabelText('Revision history')).toBeInTheDocument()
    await waitFor(() => expect(bridge.preview.register).toHaveBeenCalled())
    expect(bridge.preview.closePopOut).not.toHaveBeenCalled()
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

  it('explains when initial reference selection fails', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.workspace.chooseAttachments).mockRejectedValueOnce(new Error('File picker unavailable.'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Attach files or folders' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Choose files…' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('References could not be attached. File picker unavailable.')
    expect(screen.getByRole('textbox', { name: 'What would you like to design?' })).toBeInTheDocument()
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
    expect(screen.getByRole('menuitem', { name: /Current head/ })).toHaveTextContent(new Date(thumbnailDesign.revisions[0].createdAt).toLocaleString())
    expect(screen.getByRole('menuitem', { name: /Current head/ })).toHaveTextContent('A calm dashboard')
  })

  it('compares an earlier revision with the current head using authored file changes', async () => {
    const historicalDesign: OmniDesignDocument = { ...engagedDesign, selectedRevisionId: 'revision-1' }
    const bridge = installBridge([engagedDesign], engagedDesign)
    vi.mocked(bridge.workspace.selectRevision).mockResolvedValue(historicalDesign)
    vi.mocked(bridge.workspace.compareRevisions).mockResolvedValue({
      baseRevisionId: 'revision-1',
      targetRevisionId: 'revision-2',
      files: [
        { path: 'index.html', status: 'modified', additions: 8, deletions: 3 },
        { path: 'assets/chart.js', status: 'added', additions: 14, deletions: 0 },
      ],
      additions: 22,
      deletions: 3,
    })
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    await screen.findByRole('region', { name: 'Design conversation' })
    fireEvent.click(screen.getByRole('button', { name: /History/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Request · A calm dashboard/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Compare to current' }))

    expect(await screen.findByRole('dialog', { name: 'Compare revisions' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Authored file changes' })).toHaveTextContent('2 authored files changed')
    expect(screen.getByRole('region', { name: 'Authored file changes' })).toHaveTextContent('assets/chart.js')
    expect(bridge.workspace.compareRevisions).toHaveBeenCalledWith('design-1', 'revision-1', 'revision-2')
  })

  it('shows persisted visual quality findings and submits an explicit repair prompt', async () => {
    const qualityDesign: OmniDesignDocument = {
      ...design,
      revisions: [{
        ...design.revisions[0],
        diagnostics: [
          { id: 'quality-1', kind: 'quality', level: 'error', message: 'Horizontal overflow at 390 px (48 px beyond the viewport).', source: 'index.html', line: null, createdAt: '2026-07-20T10:00:02.000Z' },
          { id: 'quality-2', kind: 'quality', level: 'warning', message: 'No main content landmark was found.', source: 'index.html', line: null, createdAt: '2026-07-20T10:00:02.000Z' },
        ],
      }],
    }
    const bridge = installBridge([], qualityDesign)
    render(<App />)

    fireEvent.change(screen.getByRole('textbox', { name: 'What would you like to design?' }), { target: { value: 'A calm dashboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create design' }))
    expect(await screen.findByText('Visual quality check found 2 issues.')).toBeInTheDocument()
    expect(screen.getByText('Local · 2 quality issues')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fix issues' }))

    await waitFor(() => expect(bridge.workspace.generate).toHaveBeenCalledWith(
      'design-1',
      expect.stringContaining('[error] index.html: Horizontal overflow at 390 px'),
      'mock',
      'mock-v1',
      undefined,
      [],
    ))
  })

  it('rechecks and hides findings from an older quality-report version', async () => {
    const staleQualityDesign: OmniDesignDocument = {
      ...design,
      revisions: [{
        ...design.revisions[0],
        qualityCheckVersion: null,
        diagnostics: [{ id: 'stale-quality', kind: 'quality', level: 'error', message: 'The page could not be rendered for visual quality checks.', source: 'index.html', line: null, createdAt: '2026-07-20T10:00:02.000Z' }],
      }],
    }
    const bridge = installBridge([], staleQualityDesign)
    render(<App />)

    fireEvent.change(screen.getByRole('textbox', { name: 'What would you like to design?' }), { target: { value: 'A calm dashboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create design' }))
    expect(await screen.findByText('Local · checking quality')).toBeInTheDocument()
    expect(screen.queryByText('The page could not be rendered for visual quality checks.')).not.toBeInTheDocument()
    await waitFor(() => expect(bridge.preview.capture).toHaveBeenCalledWith('design-1', 'revision-1'))
  })

  it('shows the selected provider and saved state in the design header', async () => {
    const codexDesign: OmniDesignDocument = { ...design, lastSelection: { providerId: 'codex', modelId: 'gpt-5.6', effort: 'low' } }
    installBridge([codexDesign], codexDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    expect(await screen.findByText('codex · gpt-5.6 · Saved locally')).toBeInTheDocument()
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

    expect(await screen.findByText(/wasn.t applied/)).toBeInTheDocument()
    expect(screen.getByText('What went wrong')).toBeInTheDocument()
  })

  it('hides the rejected-version notice once a newer revision supersedes it', async () => {
    const repaired: OmniDesignDocument = {
      ...design,
      invalidCandidates: [{ id: 'candidate-1', prompt: 'x', html: '<p>', diagnostic: 'Needs repair.', createdAt: '2026-07-20T10:00:30.000Z' }],
      revisions: [{ ...design.revisions[0], createdAt: '2026-07-20T10:01:00.000Z' }],
    }
    installBridge([], repaired)
    render(<App />)
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await screen.findByRole('region', { name: 'Design conversation' })
    expect(screen.queryByText(/wasn.t applied/)).not.toBeInTheDocument()
  })

  it('renders an OmniDesign system notice distinctly from the agent reply', async () => {
    const withSystem: OmniDesignDocument = {
      ...design,
      messages: [
        { id: 'm1', role: 'user', text: 'make it', createdAt: '2026-07-20T10:00:00.000Z' },
        { id: 'm2', role: 'assistant', text: 'Here is your design.', createdAt: '2026-07-20T10:00:01.000Z' },
        { id: 'm3', role: 'system', text: 'OmniDesign kept your last working design.', createdAt: '2026-07-20T10:00:02.000Z' },
      ],
    }
    installBridge([], withSystem)
    render(<App />)
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('OmniDesign kept your last working design.')
    // The system note is not attributed to the agent, unlike the assistant reply.
    expect(within(note).queryByText('OmniDesign', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('Here is your design.')).toBeInTheDocument()
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
    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', expect.objectContaining({ conversationWidth: 45, mode: 'split' })))
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
    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', expect.objectContaining({ conversationWidth: 43, mode: 'conversation' })))
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

    await waitFor(() => expect(bridge.preview.popOut).toHaveBeenCalledWith(expect.objectContaining({ designId: 'design-1', revisionId: 'revision-1' })))
    expect(screen.queryByRole('region', { name: 'Generated design preview' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dock preview' }))
    expect(await screen.findByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
  })

  it('offers canvas and focused preview modes in the preview toolbar', async () => {
    installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    expect(screen.getByRole('group', { name: 'Preview layout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Canvas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Focused' })).toBeInTheDocument()
    // Device size and fit controls apply to canvas only; focused mode just fills the pane.
    expect(screen.queryByRole('group', { name: 'Preview fit' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(await screen.findByRole('group', { name: 'Preview fit' })).toBeInTheDocument()
  })

  it('restores the selected page and canvas viewport, then persists further viewport changes', async () => {
    const restored: OmniDesignDocument = {
      ...design,
      layout: { ...design.layout, previewViewMode: 'canvas', previewPage: 'about.html', previewZoom: 1.25, previewPanX: 84, previewPanY: -36 },
    }
    const bridge = installBridge([restored], restored)
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(restored.id)
    vi.mocked(bridge.workspace.get).mockResolvedValue(restored)
    vi.mocked(bridge.preview.register).mockResolvedValue({
      token: 'token-1',
      pages: [
        { path: 'index.html', title: 'Home', order: 0, isHome: true },
        { path: 'about.html', title: 'About', order: 1, isHome: false },
      ],
      entryPagePath: 'index.html',
    })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Canvas' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('125%')).toBeInTheDocument()
    expect(document.querySelector('.preview-board')).toHaveStyle({ transform: 'translate(84px, -36px) scale(1.25)' })
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', expect.objectContaining({
      previewPage: 'about.html', previewZoom: 1.35, previewPanX: 84, previewPanY: -36,
    })))
  })

  it('attaches an exact focused target from the active frame, submits it, and clears the live selection', async () => {
    const bridge = installBridge()
    const target: FocusedTarget = {
      designId: 'design-1', revisionId: 'revision-1', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', path: 'pages/pricing.html', startLine: 24, endLine: 31,
      label: '<button#buy.primary>', stableId: 'pricing-cta', excerpt: '<button>Buy now</button>', dynamicDescription: null,
    }
    vi.mocked(bridge.preview.resolveFocusedTarget).mockResolvedValue(target)
    vi.mocked(bridge.settings.getTheme).mockResolvedValue('light')
    render(<App />)

    const initialPrompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(initialPrompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(initialPrompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    const selectButton = screen.getByRole('button', { name: 'Select element' })
    fireEvent.keyDown(selectButton, { key: 'Enter' })
    fireEvent.keyUp(selectButton, { key: 'Enter' })
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('button', { name: 'Focused' })).toHaveAttribute('aria-pressed', 'true')
    const frame = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement
    expect(frame).toBeTruthy()

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        source: 'omnidesign-preview-shim', type: 'selection', page: 'index.html',
        locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', clickedLabel: '<button#buy.primary>', usedAncestor: false,
        rect: { left: 40, top: 80, right: 180, bottom: 120, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 },
      },
    }))

    const focusedEditor = await screen.findByRole('dialog', { name: 'Focused feedback' })
    expect(within(focusedEditor).getByText(/pages\/pricing\.html:24-31/)).toBeInTheDocument()
    const followUp = within(focusedEditor).getByRole('textbox', { name: 'Feedback for selected element' })
    expect(followUp).toHaveFocus()
    fireEvent.change(followUp, { target: { value: 'Make this call to action calmer' } })
    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit & fix' }))

    await waitFor(() => expect(bridge.workspace.generate).toHaveBeenCalledWith(
      'design-1', 'Make this call to action calmer', 'mock', 'mock-v1', undefined, [], target,
    ))
    expect(screen.queryByRole('dialog', { name: 'Focused feedback' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select element' })).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Select element' }))
    expect(screen.getByRole('button', { name: 'Select element' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('returns fully to active selection after closing an unsubmitted focused popup', async () => {
    const bridge = installBridge()
    const firstTarget: FocusedTarget = {
      designId: 'design-1', revisionId: 'revision-1', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', path: 'index.html', startLine: 12, endLine: 16,
      label: '<h1.hero-title>', stableId: 'hero-title', excerpt: '<h1>Move with confidence</h1>', dynamicDescription: null,
    }
    const secondTarget: FocusedTarget = {
      ...firstTarget,
      locationId: 'fb57d30b-fc27-4edc-b6ad-b5d0886ae152',
      startLine: 28,
      endLine: 31,
      label: '<button.primary>',
      stableId: 'hero-action',
      excerpt: '<button>Get started</button>',
    }
    vi.mocked(bridge.preview.resolveFocusedTarget).mockResolvedValueOnce(firstTarget).mockResolvedValueOnce(secondTarget)
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })
    const selectButton = screen.getByRole('button', { name: 'Select element' })
    await waitFor(() => expect(selectButton).toBeEnabled())
    fireEvent.click(selectButton)
    await waitFor(() => expect(selectButton).toHaveAttribute('aria-pressed', 'true'))
    const frame = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage')
    const select = (target: FocusedTarget, top: number) => window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        source: 'omnidesign-preview-shim', type: 'selection', page: 'index.html', locationId: target.locationId,
        clickedLabel: target.label, usedAncestor: false,
        rect: { left: 40, top, right: 180, bottom: top + 40, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 },
      },
    }))

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { source: 'omnidesign-preview-shim', type: 'selection-cancelled', page: 'index.html' },
    }))
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')

    select(firstTarget, 80)
    const firstPopup = await screen.findByRole('dialog', { name: 'Focused feedback' })
    expect(within(firstPopup).getByText(/index\.html:12-16/)).toBeInTheDocument()
    postMessage.mockClear()
    fireEvent.click(within(firstPopup).getByRole('button', { name: 'Close focused feedback' }))

    expect(screen.queryByRole('dialog', { name: 'Focused feedback' })).not.toBeInTheDocument()
    expect(selectButton).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'omnidesign-selection-start' }, '*'))

    select(secondTarget, 180)
    const secondPopup = await screen.findByRole('dialog', { name: 'Focused feedback' })
    expect(within(secondPopup).getByText(/index\.html:28-31/)).toBeInTheDocument()
    expect(bridge.preview.resolveFocusedTarget).toHaveBeenCalledTimes(2)
  })

  it('queues multiple focused comments in the conversation and submits them as one batch', async () => {
    const bridge = installBridge()
    const firstTarget: FocusedTarget = {
      designId: 'design-1', revisionId: 'revision-1', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', path: 'index.html', startLine: 12, endLine: 16,
      label: '<h1.hero-title>', stableId: 'hero-title', excerpt: '<h1>Move with confidence</h1>', dynamicDescription: null,
    }
    const secondTarget: FocusedTarget = {
      designId: 'design-1', revisionId: 'revision-1', locationId: 'fb57d30b-fc27-4edc-b6ad-b5d0886ae152', path: 'index.html', startLine: 28, endLine: 31,
      label: '<button.primary>', stableId: 'hero-action', excerpt: '<button>Get started</button>', dynamicDescription: null,
    }
    const firstFeedback: FocusedFeedback = {
      id: '8b7e3b7c-e81f-4b65-a0d1-907f14a9e885', comment: 'Make the heading feel more grounded.', target: firstTarget, createdAt: '2026-07-27T10:00:00.000Z',
    }
    const secondFeedback: FocusedFeedback = {
      id: 'a91b71b4-8a42-4fb8-b93e-bf398c19329d', comment: 'Give this action more breathing room.', target: secondTarget, createdAt: '2026-07-27T10:01:00.000Z',
    }
    vi.mocked(bridge.preview.resolveFocusedTarget)
      .mockResolvedValueOnce(firstTarget)
      .mockResolvedValueOnce(secondTarget)
    vi.mocked(bridge.workspace.queueFocusedFeedback)
      .mockResolvedValueOnce([firstFeedback])
      .mockResolvedValueOnce([firstFeedback, secondFeedback])
    render(<App />)

    const initialPrompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(initialPrompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(initialPrompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })
    const frame = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement
    const selectTarget = async (locationId: string, label: string, expectedReference: string) => {
      const selectButton = screen.getByRole('button', { name: 'Select element' })
      if (selectButton.getAttribute('aria-pressed') !== 'true') {
        fireEvent.keyDown(selectButton, { key: 'Enter' })
        fireEvent.keyUp(selectButton, { key: 'Enter' })
      }
      await waitFor(() => expect(selectButton).toHaveAttribute('aria-pressed', 'true'))
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          source: 'omnidesign-preview-shim', type: 'selection', page: 'index.html', locationId,
          clickedLabel: label, usedAncestor: false,
          rect: { left: 40, top: 80, right: 180, bottom: 120, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 },
        },
      }))
      await screen.findByText(new RegExp(expectedReference.replace('.', '\\.')))
    }

    await selectTarget('6c81c254-bf06-4a04-8b3c-4c39779b2466', '<h1.hero-title>', 'index.html:12-16')
    const followUp = screen.getByRole('textbox', { name: 'Feedback for selected element' })
    fireEvent.change(followUp, { target: { value: firstFeedback.comment } })
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    await waitFor(() => expect(bridge.workspace.queueFocusedFeedback).toHaveBeenCalledWith('design-1', firstFeedback.comment, firstTarget))
    expect(await screen.findByText('1 focused note queued')).toBeInTheDocument()
    await waitFor(() => expect(bridge.preview.locateFocusedTargets).toHaveBeenCalled())
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
        data: { source: 'omnidesign-preview-shim', type: 'focused-anchors', page: 'index.html', anchors: [{ id: 'focused-thread-1', locationId: firstTarget.locationId, rect: { left: 40, top: 80, right: 180, bottom: 120, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 } }] },
      }))
    expect(await screen.findByRole('button', { name: 'Focused edit thread 1, 1 comment, 1 pending' })).toBeInTheDocument()

    await selectTarget('fb57d30b-fc27-4edc-b6ad-b5d0886ae152', '<button.primary>', 'index.html:28-31')
    fireEvent.change(screen.getByRole('textbox', { name: 'Feedback for selected element' }), { target: { value: secondFeedback.comment } })
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    expect(await screen.findByText('2 focused notes queued')).toBeInTheDocument()
    await waitFor(() => expect(bridge.preview.locateFocusedTargets).toHaveBeenLastCalledWith(expect.objectContaining({
      targets: expect.arrayContaining([{ id: 'focused-thread-1', target: firstTarget }, { id: 'focused-thread-2', target: secondTarget }]),
    })))
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { source: 'omnidesign-preview-shim', type: 'focused-anchors', page: 'index.html', anchors: [
          { id: 'focused-thread-1', locationId: firstTarget.locationId, rect: { left: 40, top: 80, right: 180, bottom: 120, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 } },
          { id: 'focused-thread-2', locationId: secondTarget.locationId, rect: { left: 240, top: 220, right: 360, bottom: 260, width: 120, height: 40, viewportWidth: 800, viewportHeight: 600 } },
        ] },
      }))
    expect(await screen.findByRole('button', { name: 'Focused edit thread 2, 1 comment, 1 pending' })).toBeInTheDocument()
    expect(screen.getByText(firstFeedback.comment)).toBeInTheDocument()
    expect(screen.getByText(secondFeedback.comment)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fix all' }))
    await waitFor(() => expect(bridge.workspace.submitFocusedFeedbackBatch).toHaveBeenCalledWith(
      'design-1', [firstFeedback.id, secondFeedback.id], 'mock', 'mock-v1', undefined,
    ))
    expect(screen.queryByRole('region', { name: 'Focused feedback queue' })).not.toBeInTheDocument()
    expect(bridge.workspace.submitFocusedFeedbackBatch).toHaveBeenCalledTimes(1)
    expect(bridge.workspace.generate).not.toHaveBeenCalled()
  })

  it('keeps submitted focused edits grouped as a historical thread on their element', async () => {
    const historicalTarget: FocusedTarget = {
      designId: 'design-1', revisionId: 'revision-before-edit', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', path: 'index.html', startLine: 12, endLine: 16,
      label: '<h1.hero-title>', stableId: 'hero-title', excerpt: '<h1>Move with confidence</h1>', dynamicDescription: null,
    }
    const submittedFeedback: FocusedFeedback = {
      id: '8b7e3b7c-e81f-4b65-a0d1-907f14a9e885', comment: 'Reduce the heading width.', target: historicalTarget, createdAt: '2026-07-27T10:01:00.000Z',
    }
    const pendingFeedback: FocusedFeedback = {
      id: 'a91b71b4-8a42-4fb8-b93e-bf398c19329d', comment: 'Try a softer weight next.', target: historicalTarget, createdAt: '2026-07-27T10:02:00.000Z',
    }
    const historicalDesign: OmniDesignDocument = {
      ...design,
      messages: [
        ...design.messages,
        { id: 'focused-message', role: 'user', text: 'Make the heading feel calmer.', focusedTarget: historicalTarget, createdAt: '2026-07-27T10:00:00.000Z' },
        { id: 'focused-batch', role: 'user', text: 'Apply 1 focused edit.', focusedFeedback: [submittedFeedback], createdAt: '2026-07-27T10:01:00.000Z' },
      ],
    }
    const bridge = installBridge([historicalDesign], historicalDesign)
    const currentLocationId = 'fb57d30b-fc27-4edc-b6ad-b5d0886ae152'
    vi.mocked(bridge.settings.getLastOpenDesignId).mockResolvedValue(design.id)
    vi.mocked(bridge.workspace.listFocusedFeedback).mockResolvedValue([pendingFeedback])
    vi.mocked(bridge.preview.locateFocusedTargets).mockResolvedValue([{ id: 'focused-thread-1', locationId: currentLocationId }])
    render(<App />)

    const frame = await waitFor(() => {
      const candidate = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement | null
      expect(candidate).toBeTruthy()
      return candidate!
    })
    await waitFor(() => expect(bridge.preview.locateFocusedTargets).toHaveBeenCalledWith(expect.objectContaining({
      designId: design.id,
      revisionId: design.selectedRevisionId,
      targets: [{ id: 'focused-thread-1', target: historicalTarget }],
    })))
    await waitFor(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: { source: 'omnidesign-preview-shim', type: 'focused-anchors', page: 'index.html', anchors: [{ id: 'focused-thread-1', locationId: currentLocationId, rect: { left: 40, top: 80, right: 180, bottom: 120, width: 140, height: 40, viewportWidth: 800, viewportHeight: 600 } }] },
      }))
      expect(screen.getByRole('button', { name: 'Focused edit thread 1, 3 comments, 1 pending' })).toBeInTheDocument()
    })

    const threadButton = screen.getByRole('button', { name: 'Focused edit thread 1, 3 comments, 1 pending' })
    expect(threadButton).toHaveAttribute('data-has-pending', 'true')
    const threadDetail = document.getElementById(threadButton.getAttribute('aria-describedby')!)!
    expect(within(threadDetail).getByText('Make the heading feel calmer.')).toBeInTheDocument()
    expect(within(threadDetail).getByText('Reduce the heading width.')).toBeInTheDocument()
    expect(within(threadDetail).getByText('Try a softer weight next.')).toBeInTheDocument()
    expect(within(threadDetail).getAllByText('Submitted')).toHaveLength(2)
    expect(within(threadDetail).getByText('Pending')).toBeInTheDocument()
  })

  it('drops a focused resolution that becomes stale while the preview mode changes', async () => {
    const bridge = installBridge()
    let finishResolution: ((target: FocusedTarget) => void) | undefined
    vi.mocked(bridge.preview.resolveFocusedTarget).mockImplementation(() => new Promise((resolve) => { finishResolution = resolve }))
    render(<App />)

    const initialPrompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(initialPrompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(initialPrompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })
    const selectElement = screen.getByRole('button', { name: 'Select element' })
    await waitFor(() => expect(selectElement).toBeEnabled())
    fireEvent.click(selectElement)
    await waitFor(() => expect(selectElement).toHaveAttribute('aria-pressed', 'true'))
    const frame = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { source: 'omnidesign-preview-shim', type: 'selection', page: 'index.html', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', clickedLabel: '<button>', usedAncestor: false },
    }))
    await waitFor(() => expect(bridge.preview.resolveFocusedTarget).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(selectElement).toHaveAttribute('aria-pressed', 'true')
    await act(async () => finishResolution?.({
      designId: 'design-1', revisionId: 'revision-1', locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', path: 'index.html', startLine: 5, endLine: 5,
      label: '<button>', stableId: null, excerpt: '<button>Go</button>', dynamicDescription: null,
    }))

    expect(screen.queryByText('index.html:5-5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Focused' }))
    expect(selectElement).toHaveAttribute('aria-pressed', 'true')
  })

  it('configures and persists a custom canvas size while focused mode stays unconstrained', async () => {
    const bridge = installBridge()
    render(<App />)
    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    expect(screen.queryByRole('button', { name: 'Device size' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Device size' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Custom/ }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Custom preview width' }), { target: { value: '1440' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom preview height' }), { target: { value: '960' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply size' }))

    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', expect.objectContaining({ previewDevice: 'custom', previewCustomWidth: 1440, previewCustomHeight: 960 })))
  })

  it('opens a page in focused mode by double-clicking its filename on the canvas', async () => {
    installBridge()
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    await screen.findByRole('region', { name: 'Generated design preview' })

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    const caption = await screen.findByTitle('Double-click to open in focused view')
    // A single click stays on the canvas; only a double-click opens the page.
    fireEvent.click(caption)
    expect(screen.getByRole('group', { name: 'Preview fit' })).toBeInTheDocument()
    fireEvent.dblClick(caption)

    // Back in focused mode: the canvas-only fit controls are gone.
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Preview fit' })).not.toBeInTheDocument())
  })

  it('recognizes when an in-preview link navigates the focused frame to another design page', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.preview.register).mockResolvedValue({
      token: 'token-1',
      pages: [
        { path: 'index.html', title: 'Home', order: 0, isHome: true },
        { path: 'about.html', title: 'About', order: 1, isHome: false },
      ],
      entryPagePath: 'index.html',
    })
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })
    const frame = await waitFor(() => {
      const candidate = document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement | null
      expect(candidate?.dataset.page).toBe('index.html')
      return candidate!
    })

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { source: 'omnidesign-preview-shim', type: 'page', page: 'about.html' },
    }))

    await waitFor(() => expect((document.querySelector('.preview-focused-fill iframe') as HTMLIFrameElement).dataset.page).toBe('about.html'))
    expect(screen.getByRole('button', { name: 'Preview page' })).toHaveTextContent('About')
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

  it('opens a design directly from the recent list instead of a project page', async () => {
    installBridge([design])
    render(<App />)

    const main = await screen.findByRole('main')
    fireEvent.click(await within(main).findByRole('button', { name: /Calm dashboard/ }))

    expect(await screen.findByRole('textbox', { name: 'Request a design change' })).toBeInTheDocument()
  })

  it('shows a title-pending indicator instead of the rename control while a title generates', async () => {
    installBridge([{ ...design, titlePending: true }])
    render(<App />)

    const main = await screen.findByRole('main')
    fireEvent.click(await within(main).findByRole('button', { name: /Calm dashboard/ }))

    expect(await screen.findByRole('status', { name: 'Generating title…' })).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: 'Rename design' }) as HTMLInputElement).readOnly).toBe(true)
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

  it('turns provider failures into actionable recovery while retaining diagnostics', async () => {
    const failedDesign: OmniDesignDocument = {
      ...design,
      queuePaused: true,
      generationJobs: [{
        id: 'e0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'Try again', providerId: 'codex', modelId: 'gpt-5.6', state: 'failed',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: '2026-07-20T10:01:02.000Z', error: 'fetch failed: ENOTFOUND api.openai.com', attachments: [],
      }, {
        id: 'f0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'Queued after failure', providerId: 'codex', modelId: 'gpt-5.6', state: 'queued',
        createdAt: '2026-07-20T10:02:00.000Z', startedAt: null, completedAt: null, error: null, attachments: [],
      }],
    }
    installBridge([failedDesign], failedDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    expect(await screen.findByText('Provider connection unavailable')).toBeInTheDocument()
    expect(screen.getByText('Check your connection and provider service, then retry.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Queued prompts' })).toHaveTextContent('Waiting for you to resume generation')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    const details = screen.getByText('Technical details').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent('ENOTFOUND api.openai.com')
  })

  it('retires an old failure after later work completes successfully', async () => {
    const recoveredDesign: OmniDesignDocument = {
      ...design,
      generationJobs: [{
        id: 'e0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'First attempt', providerId: 'codex', modelId: 'gpt-5.6', state: 'failed',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: '2026-07-20T10:01:02.000Z', error: 'Connection lost', attachments: [],
      }, {
        id: 'f0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'First attempt', providerId: 'codex', modelId: 'gpt-5.6', state: 'completed',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:02:01.000Z', completedAt: '2026-07-20T10:02:02.000Z', error: null, attachments: [],
      }],
    }
    installBridge([recoveredDesign], recoveredDesign)
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByText('Generation failed')).not.toBeInTheDocument()
  })

  it('opens a single-design project straight into its workspace', async () => {
    const bridge = installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    vi.mocked(bridge.preview.closePopOut).mockClear()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Calm dashboard' }))
    expect(bridge.preview.closePopOut).not.toHaveBeenCalled()
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

  it('rolls back a setting and explains when local persistence fails', async () => {
    const bridge = installBridge()
    vi.mocked(bridge.settings.saveNotificationsEnabled).mockRejectedValueOnce(new Error('Settings database is locked.'))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const notifications = await screen.findByRole('switch', { name: 'System notifications' })

    fireEvent.click(notifications)

    expect(await screen.findByRole('alert')).toHaveTextContent('Settings could not be synchronized.')
    expect(screen.getByRole('alert')).toHaveTextContent('Settings database is locked.')
    await waitFor(() => expect(notifications).toBeChecked())
    expect(screen.getByText('Saved locally', { selector: '#notifications-heading + span' })).toBeInTheDocument()
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

  it('explains when a supplied reference can no longer be opened', async () => {
    const attachedDesign: OmniDesignDocument = {
      ...design,
      messages: [{ ...design.messages[0], attachments: [{
        id: '123e4567-e89b-42d3-a456-426614174000', name: 'reference.pdf', path: 'C:\\references\\reference.pdf', kind: 'file', size: 42, modifiedAt: '2026-07-22T12:00:00.000Z', selectedAt: '2026-07-22T12:00:00.000Z', status: 'available',
      }] }],
    }
    const bridge = installBridge([attachedDesign], attachedDesign)
    vi.mocked(bridge.workspace.openAttachment).mockRejectedValueOnce(new Error('The file was moved.'))
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))
    fireEvent.click(await screen.findByRole('button', { name: 'reference.pdf' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The reference could not be opened.')
    expect(screen.getByRole('alert')).toHaveTextContent('The file was moved.')
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

  it('multi-selects designs in the project grid and bulk-removes them', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    const bridge = installBridge([first, second])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(first), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Studio', designCount: 2 }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Studio' }))
    const grid = await screen.findByRole('group', { name: 'Designs in this project' })

    fireEvent.click(within(grid).getByRole('checkbox', { name: 'Select Overview' }))
    fireEvent.click(within(grid).getByRole('checkbox', { name: 'Select Settings screen' }))
    const bulkBar = await screen.findByRole('group', { name: 'Bulk design actions' })
    expect(bulkBar).toHaveTextContent('2 selected')

    fireEvent.click(within(bulkBar).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(bridge.workspace.trash).toHaveBeenCalledWith('design', 'design-1'))
    expect(bridge.workspace.trash).toHaveBeenCalledWith('design', 'design-2')
  })

  it('moves selected designs to any other project, including a standalone project', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio', sourceProjectPath: 'C:\\Projects\\Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio', sourceProjectPath: 'C:\\Projects\\Studio' }
    const destination: OmniDesignDocument = { ...design, id: 'destination-design', title: 'Solo destination', projectId: 'destination', projectName: 'Solo destination' }
    const bridge = installBridge([first, second, destination])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Studio' }))
    const grid = await screen.findByRole('group', { name: 'Designs in this project' })
    fireEvent.click(within(grid).getByRole('checkbox', { name: 'Select Overview' }))
    const bulkBar = await screen.findByRole('group', { name: 'Bulk design actions' })
    fireEvent.click(within(bulkBar).getByRole('button', { name: 'Move selected to project' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Solo destination' }))

    await waitFor(() => expect(bridge.workspace.associateDesign).toHaveBeenCalledWith('design-1', 'destination'))
  })

  it('renders sidebar project designs from shared state without a per-project request', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    const bridge = installBridge([first, second])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([{ ...projectFromDesign(first), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Studio', designCount: 2 }])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Expand Studio' }))
    const sublist = await within(sidebar).findByRole('group', { name: 'Studio designs' })
    expect(within(sublist).getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(await within(sublist).findByRole('button', { name: 'Settings screen' })).toBeInTheDocument()
    expect(bridge.workspace.getProject).not.toHaveBeenCalled()
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
    const title = within(grid).getByRole('textbox', { name: 'Rename Settings screen design' })
    fireEvent.focus(title)
    fireEvent.change(title, { target: { value: 'Preferences' } })
    fireEvent.blur(title)

    await waitFor(() => expect(bridge.workspace.renameDesign).toHaveBeenCalledWith('design-2', 'Preferences'))
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

  it('opens the Library from the sidebar and lists projects and designs', async () => {
    installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Library' }))

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Designs' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Folders' })).toBeInTheDocument()
    // The existing design appears in the browse grid.
    const grid = screen.getByRole('group', { name: 'Designs' })
    expect(within(grid).getByRole('button', { name: 'Open Calm dashboard' })).toBeInTheDocument()
  })

  it('creates a folder from the Library rail through the folder dialog', async () => {
    const bridge = installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Library' }))
    await screen.findByRole('heading', { name: 'Library' })

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    const nameField = await screen.findByRole('textbox', { name: 'Folder name' })
    fireEvent.change(nameField, { target: { value: 'Client work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))

    await waitFor(() => expect(bridge.workspace.createFolder).toHaveBeenCalledWith('Client work', null))
  })

  it('files a project into a folder by drag and drop', async () => {
    const bridge = installBridge([design])
    vi.mocked(bridge.workspace.listFolders).mockResolvedValue([{ id: 'folder-1', name: 'Client work', parentFolderId: null, sortOrder: 0, createdAt: design.createdAt, updatedAt: design.updatedAt }])
    render(<App />)
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name: 'Library' }))
    await screen.findByRole('heading', { name: 'Library' })

    const dataTransfer = { setData: vi.fn(), effectAllowed: 'none', dropEffect: 'none' }
    fireEvent.dragStart(screen.getByRole('img', { name: 'Drag Calm dashboard to a folder' }), { dataTransfer })
    const folderRow = screen.getByRole('button', { name: 'Client work' }).closest('.library-folder-row')
    expect(folderRow).not.toBeNull()
    fireEvent.dragOver(folderRow as HTMLElement, { dataTransfer })
    fireEvent.drop(folderRow as HTMLElement, { dataTransfer })

    await waitFor(() => expect(bridge.workspace.moveProjectToFolder).toHaveBeenCalledWith('project-1', 'folder-1'))
  })

  it('filters the Library by project type and provider', async () => {
    const standalone = { ...design, id: 'standalone-design', title: 'Solo concept', projectId: 'standalone-project', projectName: 'Solo concept' }
    const linked: OmniDesignDocument = { ...design, id: 'linked-design', title: 'Team dashboard', projectId: 'team-project', projectName: 'Team', sourceProjectPath: 'C:\\Projects\\Team', lastSelection: { providerId: 'codex', modelId: 'gpt-5.6', effort: null } }
    const bridge = installBridge([standalone, linked])
    vi.mocked(bridge.workspace.listProjects).mockResolvedValue([
      projectFromDesign(standalone),
      { ...projectFromDesign(linked), kind: 'linked', sourceProjectPath: 'C:\\Projects\\Team' },
    ])
    render(<App />)
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name: 'Library' }))
    await screen.findByRole('heading', { name: 'Library' })

    fireEvent.click(screen.getByRole('button', { name: 'Filter by project type' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Linked' }))
    expect(screen.queryByRole('button', { name: 'Open Solo concept' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Team dashboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by provider' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Codex' }))
    expect(screen.getByRole('button', { name: 'Open Team dashboard' })).toBeInTheDocument()
  })
})
