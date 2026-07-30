import { describe, expect, it, vi } from 'vitest'
import { discoverLocalDependencies, isLocalDependencyId, localDependencySetupUrl } from './localDependencies.js'

describe('local dependency discovery', () => {
  it('reports an installed Git executable without exposing its path', async () => {
    const probe = vi.fn().mockResolvedValue('git version 2.55.0.windows.1')

    await expect(discoverLocalDependencies(probe)).resolves.toEqual([{
      id: 'git',
      name: 'Git',
      installed: true,
      required: true,
      detail: 'git version 2.55.0.windows.1 is available for design history and project cloning.',
    }])
    expect(probe).toHaveBeenCalledWith('git')
  })

  it('returns actionable missing state instead of rejecting discovery', async () => {
    await expect(discoverLocalDependencies(vi.fn().mockRejectedValue(new Error('missing')))).resolves.toEqual([expect.objectContaining({
      id: 'git',
      installed: false,
      required: true,
    })])
  })

  it('allow-lists dependency ids and official platform setup pages', () => {
    expect(isLocalDependencyId('git')).toBe(true)
    expect(isLocalDependencyId('anything-else')).toBe(false)
    expect(localDependencySetupUrl('git', 'win32')).toBe('https://git-scm.com/install/windows')
    expect(localDependencySetupUrl('git', 'darwin')).toBe('https://git-scm.com/install/mac')
    expect(localDependencySetupUrl('git', 'linux')).toBe('https://git-scm.com/install/linux')
  })
})
