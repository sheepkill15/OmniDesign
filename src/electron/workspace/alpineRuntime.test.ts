import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { alpineRuntimeVersion } from './alpineRuntime.js'

// The vendored runtime is committed by scripts/vendor-alpine.mjs. This test fails when the installed
// Alpine packages move (dependency bump) without re-running `pnpm vendor:alpine`, preventing silent
// drift between the shipped runtime and the dependency versions.
describe('vendored Alpine runtime', () => {
  it('matches the installed alpinejs version', () => {
    const require = createRequire(import.meta.url)
    expect(alpineRuntimeVersion).toBe(require('alpinejs/package.json').version)
    expect(alpineRuntimeVersion).toBe(require('@alpinejs/collapse/package.json').version)
  })
})
