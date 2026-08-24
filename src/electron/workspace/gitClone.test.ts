import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cloneDirectoryName, cloneRepository, assertSafeRemoteUrl } from './gitClone.js'

const directories: string[] = []

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

describe('cloneRepository', () => {
  it('clones through the installed Git executable and reports progress', async () => {
    const root = temporaryDirectory('omnidesign-git-clone-')
    const remote = path.join(root, 'remote.git')
    const destination = path.join(root, 'remote')
    execFileSync('git', ['init', '--bare', remote], { windowsHide: true })
    const progress: string[] = []

    const clonePath = await cloneRepository(remote, root, (activity) => progress.push(activity.detail))

    expect(progress).toContain('Starting Git clone…')
    expect(progress).toContain('Repository cloned successfully.')
    expect(clonePath).toBe(destination)
    expect(() => execFileSync('git', ['-C', destination, 'status'], { windowsHide: true })).not.toThrow()
  })

  it('derives the clone folder from HTTPS and SSH repository URLs', () => {
    expect(cloneDirectoryName('https://github.com/team/omni-design.git')).toBe('omni-design')
    expect(cloneDirectoryName('git@github.com:team/omni-design.git')).toBe('omni-design')
  })
})

describe('assertSafeRemoteUrl', () => {
  it('accepts HTTPS, SSH, scp-like, and absolute local repository URLs', () => {
    expect(assertSafeRemoteUrl('https://github.com/team/omni-design.git')).toBe('https://github.com/team/omni-design.git')
    expect(assertSafeRemoteUrl('ssh://git@github.com/team/omni-design.git')).toBe('ssh://git@github.com/team/omni-design.git')
    expect(assertSafeRemoteUrl('git@github.com:team/omni-design.git')).toBe('git@github.com:team/omni-design.git')
    expect(assertSafeRemoteUrl('C:\\repos\\omni-design')).toBe('C:\\repos\\omni-design')
  })

  it('rejects command-transport URLs that would execute arbitrary commands', () => {
    expect(() => assertSafeRemoteUrl('ext::sh -c touch /tmp/pwned')).toThrow(/not supported/)
    expect(() => assertSafeRemoteUrl('file::/dev/stdin')).toThrow(/not supported/)
    expect(() => assertSafeRemoteUrl('fd::17')).toThrow(/not supported/)
  })

  it('rejects option-injection and non-allowlisted schemes', () => {
    expect(() => assertSafeRemoteUrl('--upload-pack=touch /tmp/pwned')).toThrow()
    expect(() => assertSafeRemoteUrl('-c core.fsmonitor=evil')).toThrow()
    expect(() => assertSafeRemoteUrl('file:///etc/passwd')).toThrow(/not supported/)
    expect(() => assertSafeRemoteUrl('x-mas://example.com/repo.git')).toThrow(/not supported/)
  })

  it('rejects empty values and relative paths', () => {
    expect(() => assertSafeRemoteUrl('   ')).toThrow()
    expect(() => assertSafeRemoteUrl('./local-repo')).toThrow()
    expect(() => assertSafeRemoteUrl('team/omni-design.git')).toThrow()
  })
})
