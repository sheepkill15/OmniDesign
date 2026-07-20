import { describe, expect, it } from 'vitest'
import { isProviderId } from './providerService.js'

describe('isProviderId', () => {
  it('only accepts the built-in subscription providers', () => {
    expect(isProviderId('codex')).toBe(true)
    expect(isProviderId('claude')).toBe(true)
    expect(isProviderId('anything-else')).toBe(false)
  })
})
