import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  layout: { conversationWidth: 43 },
  messages: [{ id: 'message-1', role: 'user', text: 'A calm dashboard', createdAt: '2026-07-20T10:00:00.000Z' }],
  invalidCandidates: [],
  generationJobs: [],
  revisions: [{ id: 'revision-1', parentRevisionId: null, prompt: 'A calm dashboard', providerId: 'mock', modelId: 'mock-v1', createdAt: '2026-07-20T10:00:00.000Z', html: '<html><body>Dashboard</body></html>', thumbnailDataUrl: null, diagnostics: [] }],
}

function installBridge(initialDesigns: OmniDesignDocument[] = [], createdDesign: OmniDesignDocument = design) {
  const listeners: Array<(activity: GenerationActivity) => void> = []
  const bridge = {
    providers: {
      discover: vi.fn().mockResolvedValue([{ id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] }]),
      prompt: vi.fn(),
      onActivity: vi.fn().mockReturnValue(() => undefined),
    },
    workspace: {
      list: vi.fn().mockResolvedValue(initialDesigns),
      get: vi.fn().mockResolvedValue(createdDesign),
      create: vi.fn().mockResolvedValue(createdDesign),
      generate: vi.fn().mockResolvedValue(design),
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
      onDiagnostic: vi.fn().mockReturnValue(() => undefined),
      onThumbnail: vi.fn().mockReturnValue(() => undefined),
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

  it('reports an installed provider while keeping the mock provider active', async () => {
    installBridge()
    render(<App />)

    await waitFor(() => expect(screen.getByText(/Codex available/)).toBeInTheDocument())
    expect(screen.getByText(/Development provider active/)).toBeInTheDocument()
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
        id: '7e3670bd-2f6c-444d-afd0-a26e17839964', designId: 'design-1', prompt: 'Try a warmer direction', state: 'queued',
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

    await waitFor(() => expect(bridge.workspace.create).toHaveBeenCalledWith('A calm dashboard'))
    expect(await screen.findByRole('region', { name: 'Design conversation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Generated design preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
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
    await waitFor(() => expect(bridge.workspace.saveLayout).toHaveBeenCalledWith('design-1', { conversationWidth: 45 }))
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
        id: 'e0684c4c-0d07-4ece-9d6f-22c2f523e399', designId: 'design-1', prompt: 'Try again', state: 'interrupted',
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
})
