import { describe, expect, it, vi } from 'vitest'
import { parseClaudeEfforts, parseClaudeModels } from './claudeAdapter.js'
import { describeCodexTool } from './codexAdapter.js'
import type { ProviderAdapter, ProviderAdapterPrompt } from './providerAdapter.js'
import { isProviderId, ProviderService } from './providerService.js'
import { providerFailure } from './providerUtils.js'

function createAdapter(id: 'codex' | 'claude'): ProviderAdapter {
  return {
    id,
    discover: vi.fn(async () => ({
      name: `${id} adapter`,
      installed: true,
      authenticated: true,
      detail: 'Ready',
      models: [{ id: 'model-1', name: 'Model 1', effortLevels: [] }],
    })),
    prompt: vi.fn(async (_request: ProviderAdapterPrompt, onActivity) => {
      onActivity({ kind: 'tool', label: 'Agent action', detail: 'inspect' })
      return { modelId: 'model-1', text: 'Done' }
    }),
  }
}

describe('ProviderService', () => {
  it('discovers every adapter through the same contract and supplies its identity', async () => {
    const codex = createAdapter('codex')
    const claude = createAdapter('claude')

    await expect(new ProviderService([codex, claude]).discover()).resolves.toEqual([
      {
        id: 'codex',
        name: 'codex adapter',
        installed: true,
        authenticated: true,
        detail: 'Ready',
        models: [{ id: 'model-1', name: 'Model 1', effortLevels: [] }],
      },
      {
        id: 'claude',
        name: 'claude adapter',
        installed: true,
        authenticated: true,
        detail: 'Ready',
        models: [{ id: 'model-1', name: 'Model 1', effortLevels: [] }],
      },
    ])
    expect(codex.discover).toHaveBeenCalledOnce()
    expect(claude.discover).toHaveBeenCalledOnce()
  })

  it('routes prompts without leaking provider differences to the caller', async () => {
    const codex = createAdapter('codex')
    const claude = createAdapter('claude')
    const activity = vi.fn()
    const service = new ProviderService([codex, claude])

    await expect(service.prompt({
      requestId: 'request-1',
      providerId: 'claude',
      modelId: 'model-1',
      effort: 'high',
      prompt: 'Build it',
      referencePaths: ['C:\\references'],
    }, activity)).resolves.toEqual({ providerId: 'claude', modelId: 'model-1', text: 'Done' })

    expect(codex.prompt).not.toHaveBeenCalled()
    expect(claude.prompt).toHaveBeenCalledWith(
      { modelId: 'model-1', effort: 'high', prompt: 'Build it', referencePaths: ['C:\\references'] },
      expect.any(Function),
    )
    expect(activity).toHaveBeenCalledWith({
      requestId: 'request-1',
      providerId: 'claude',
      kind: 'tool',
      label: 'Agent action',
      detail: 'inspect',
    })
  })

  it('forwards cancellation through the provider-neutral prompt contract', async () => {
    const claude = createAdapter('claude')
    const controller = new AbortController()
    const service = new ProviderService([claude])

    await service.prompt({
      requestId: 'request-cancel',
      providerId: 'claude',
      modelId: 'model-1',
      prompt: 'Build it',
      signal: controller.signal,
    })

    expect(claude.prompt).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }), expect.any(Function))
  })

  it('runs a design agent in its managed workspace and validates its conversational completion payload', async () => {
    const codex = createAdapter('codex')
    const service = new ProviderService([codex])
    vi.mocked(codex.prompt).mockResolvedValueOnce({ modelId: 'model-1', text: '{"response":"The design is ready."}' })

    await expect(service.runDesignAgent({
      requestId: 'request-2', providerId: 'codex', modelId: 'model-1', prompt: 'Refine the hierarchy', workspacePath: 'C:\\workspace\\design',
    })).resolves.toEqual({ providerId: 'codex', modelId: 'model-1', response: 'The design is ready.' })

    expect(codex.prompt).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: 'C:\\workspace\\design',
      outputSchema: expect.objectContaining({ required: ['response'] }),
      instructions: expect.stringContaining('C:\\workspace\\design'),
    }), expect.any(Function))
  })

  it('passes a linked project through as a provider reference root', async () => {
    const codex = createAdapter('codex')
    const service = new ProviderService([codex])
    vi.mocked(codex.prompt).mockResolvedValueOnce({ modelId: 'model-1', text: '{"response":"Done"}' })

    await service.runDesignAgent({ requestId: 'request-3', providerId: 'codex', modelId: 'model-1', prompt: 'Match Aurora', workspacePath: 'C:\\workspace\\design', sourceProjectPath: 'C:\\projects\\aurora' })

    expect(codex.prompt).toHaveBeenCalledWith(expect.objectContaining({ referencePaths: ['C:\\projects\\aurora'], instructions: expect.stringContaining('Inspect its relevant source') }), expect.any(Function))
  })

  it('passes provider session identity through design-agent continuation', async () => {
    const codex = createAdapter('codex')
    const service = new ProviderService([codex])
    vi.mocked(codex.prompt).mockResolvedValueOnce({ modelId: 'model-1', text: '{"response":"Done"}', sessionId: 'thread-1' })

    await expect(service.runDesignAgent({ requestId: 'request-continue', providerId: 'codex', modelId: 'model-1', prompt: 'Continue', workspacePath: 'C:\\workspace\\design', resumeSessionId: 'thread-1' })).resolves.toMatchObject({ sessionId: 'thread-1' })

    expect(codex.prompt).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: 'thread-1' }), expect.any(Function))
  })

  it('rejects duplicate adapter identities', () => {
    expect(() => new ProviderService([createAdapter('codex'), createAdapter('codex')])).toThrow(
      'Provider adapter identifiers must be unique.',
    )
  })
})

describe('isProviderId', () => {
  it('only accepts the built-in subscription providers', () => {
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('anything-else')).toBe(false)
  })
})

describe('parseClaudeModels', () => {
  it('derives current aliases from the installed CLI help instead of a static catalogue', () => {
    const help = `--model <model>  Model for the current session. Provide
  an alias for the latest model (e.g.
  'fable', 'opus', or 'sonnet') or a
  model's full name
--effort <level> Effort level (low, medium, high, xhigh, max)`
    const effortLevels = [
      { id: 'low', name: 'Low', isDefault: false },
      { id: 'medium', name: 'Medium', isDefault: false },
      { id: 'high', name: 'High', isDefault: false },
      { id: 'xhigh', name: 'Xhigh', isDefault: false },
      { id: 'max', name: 'Max', isDefault: false },
    ]

    expect(parseClaudeModels(help)).toEqual([
      { id: 'fable', name: 'Claude Fable (latest)', effortLevels },
      { id: 'opus', name: 'Claude Opus (latest)', effortLevels },
      { id: 'sonnet', name: 'Claude Sonnet (latest)', effortLevels },
    ])
    expect(parseClaudeEfforts(help)).toEqual(effortLevels)
  })
})

describe('providerFailure', () => {
  it('surfaces structured errors written to stdout', () => {
    expect(providerFailure('Claude', '{"result":"Selected model is unavailable."}', '').message).toBe('Selected model is unavailable.')
  })
})

describe('describeCodexTool', () => {
  it('normalizes common tool actions and excludes provider-only item types', () => {
    // Tool activities are normalized to short, non-technical phrases (no command text or query).
    expect(describeCodexTool({ item: { type: 'commandExecution', command: 'pnpm test' } })).toBe('Running a command')
    expect(describeCodexTool({ item: { type: 'fileChange' } })).toBe('Editing the design')
    expect(describeCodexTool({ item: { type: 'webSearch', query: 'accessible dialogs' } })).toBe('Looking something up')
    expect(describeCodexTool({ item: { type: 'reasoning', summary: ['Thinking'] } })).toBeUndefined()
    expect(describeCodexTool({ item: { type: 'agentMessage', text: 'Done' } })).toBeUndefined()
  })
})
