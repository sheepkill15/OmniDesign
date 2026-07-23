import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cloneDirectoryName, cloneRepository } from './gitClone.js'

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
