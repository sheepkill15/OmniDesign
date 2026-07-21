import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const design: OmniDesignDocument = {
  id: 'design-1',
  projectId: 'project-1',
  projectName: 'Calm dashboard',
  title: 'Calm dashboard',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
  activeRevisionId: 'revision-1',
  selectedRevisionId: 'revision-1',
  draft: '',
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
      discover: vi.fn().mockResolvedValue([{ id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] }]),
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
      get: vi.fn().mockResolvedValue(createdDesign),
      create: vi.fn().mockResolvedValue(createdDesign),
      generate: vi.fn().mockResolvedValue(design),
      chooseProjectFolder: vi.fn().mockResolvedValue(null),
      cancelGeneration: vi.fn().mockResolvedValue(undefined),
      retryGeneration: vi.fn().mockResolvedValue(undefined),
      selectRevision: vi.fn().mockResolvedValue(design),
      restoreRevision: vi.fn().mockResolvedValue(design),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      saveLayout: vi.fn().mockResolvedValue(undefined),
      exportRevision: vi.fn().mockResolvedValue({ canceled: true }),
      onActivity: vi.fn((listener: (activity: GenerationActivity) => void) => { listeners.push(listener); return () => undefined }),
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
    },
  } as unknown as Window['omnidesign']
  Object.defineProperty(window, 'omnidesign', { value: bridge, configurable: true })
  return bridge
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

  it('opens provider availability and refreshes local provider discovery', async () => {
    const bridge = installBridge()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }))
    expect(await screen.findByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getAllByText('Ready')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(bridge.providers.discover).toHaveBeenCalledTimes(3))
  })

  it('shows active work globally and can cancel it from the generations view', async () => {
    const queuedDesign: OmniDesignDocument = {
      ...design,
      queuePaused: true,
      generationJobs: [{
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Try a warmer direction', providerId: 'mock', modelId: 'mock-v1', state: 'queued',
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: null, completedAt: null, error: null,
      }],
    }
    const bridge = installBridge([queuedDesign])
    render(<App />)

    await screen.findAllByText('Calm dashboard')
    fireEvent.click(screen.getByRole('button', { name: /Generations/ }))
    expect(await screen.findByRole('heading', { name: 'Generations' })).toBeInTheDocument()
    expect(screen.getByText(/Try a warmer direction/)).toBeInTheDocument()
    expect(screen.getByText(/Queue paused/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(bridge.workspace.cancelGeneration).toHaveBeenCalledWith('7e3670bd-2f6c-444d-afd0-a26e17839964'))
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

  it('pre-fills the composer target from a project row add button', async () => {
    const bridge = installBridge([design])
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
    fireEvent.click(screen.getByRole('button', { name: /History/ }))
    await waitFor(() => expect(bridge.preview.setSuspended).toHaveBeenLastCalledWith(false))
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
        createdAt: '2026-07-20T10:01:00.000Z', startedAt: '2026-07-20T10:01:01.000Z', completedAt: '2026-07-20T10:01:02.000Z', error: 'OmniDesign closed before this generation completed.',
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
    installBridge([design])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Calm dashboard' }))

    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
  })

  it('expands a project in the sidebar to open a specific design', async () => {
    const first: OmniDesignDocument = { ...design, id: 'design-1', title: 'Overview', projectId: 'studio', projectName: 'Studio' }
    const second: OmniDesignDocument = { ...design, id: 'design-2', title: 'Settings screen', projectId: 'studio', projectName: 'Studio' }
    installBridge([first, second])
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
    installBridge([first, second])
    render(<App />)

    const sidebar = screen.getByRole('complementary', { name: 'Primary navigation' })
    fireEvent.click(await within(sidebar).findByRole('button', { name: 'Studio' }))

    const grid = await screen.findByRole('group', { name: 'Designs in this project' })
    fireEvent.click(within(grid).getByRole('button', { name: /Settings screen/ }))
    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
  })
})
