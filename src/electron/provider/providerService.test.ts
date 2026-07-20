import { describe, expect, it } from 'vitest'
import { isProviderId, parseClaudeModels, providerFailure } from './providerService.js'

describe('isProviderId', () => {
  it('only accepts the built-in subscription providers', () => {
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('anything-else')).toBe(false)
  })
})

describe('parseClaudeModels', () => {
  it('derives current aliases from the installed CLI help instead of a static catalogue', () => {
    const help = `--model <model>  Model for the current session. Provide\n  an alias for the latest model (e.g.\n  'fable', 'opus', or 'sonnet') or a\n  model's full name`

    expect(parseClaudeModels(help)).toEqual([
      { id: 'fable', name: 'Claude Fable (latest)' },
      { id: 'opus', name: 'Claude Opus (latest)' },
      { id: 'sonnet', name: 'Claude Sonnet (latest)' },
    ])
  })
})

describe('providerFailure', () => {
  it('surfaces structured errors written to stdout', () => {
    expect(providerFailure('Claude', '{"result":"Selected model is unavailable."}', '').message).toBe('Selected model is unavailable.')
  })
})
