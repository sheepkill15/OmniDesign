import { describe, expect, it } from 'vitest'
import { providerSetupUrl } from './providerSetup.js'

describe('provider setup links', () => {
  it('keeps each built-in provider on its official CLI setup guide', () => {
    expect(providerSetupUrl('codex')).toBe('https://developers.openai.com/codex/cli/')
    expect(providerSetupUrl('claude')).toBe('https://code.claude.com/docs/en/installation')
  })
})
