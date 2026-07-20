import { describe, expect, it } from 'vitest'
import { isProviderId, parseClaudeEfforts, parseClaudeModels, providerFailure } from './providerService.js'

describe('isProviderId', () => {
  it('only accepts the built-in subscription providers', () => {
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('anything-else')).toBe(false)
  })
})

describe('parseClaudeModels', () => {
  it('derives current aliases from the installed CLI help instead of a static catalogue', () => {
    const help = `--model <model>  Model for the current session. Provide\n  an alias for the latest model (e.g.\n  'fable', 'opus', or 'sonnet') or a\n  model's full name\n--effort <level> Effort level (low, medium, high, xhigh, max)`
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
