import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DesignRepositoryManager } from './designRepository.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('DesignRepositoryManager', () => {
  it('initializes a managed Git repository with a prepared index entry page', () => {
    const artifactsDirectory = mkdtempSync(path.join(tmpdir(), 'omnidesign-repository-'))
    directories.push(artifactsDirectory)
    const manager = new DesignRepositoryManager(artifactsDirectory)

    const repositoryPath = manager.initialize('design-1')

    expect(readFileSync(path.join(repositoryPath, 'index.html'), 'utf8')).toContain('<!doctype html>')
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim()).toBe('1')
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repositoryPath, encoding: 'utf8' })).toBe('')
  })

  it('commits a changed prepared entry page and ignores unchanged content', () => {
    const artifactsDirectory = mkdtempSync(path.join(tmpdir(), 'omnidesign-repository-'))
    directories.push(artifactsDirectory)
    const manager = new DesignRepositoryManager(artifactsDirectory)
    const html = '<!doctype html><html><body>Updated</body></html>'

    const commit = manager.commitIndexHtml('design-2', html, 'Update design')

    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect(manager.commitIndexHtml('design-2', html, 'Duplicate update')).toBeNull()
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: manager.getPath('design-2'), encoding: 'utf8' }).trim()).toBe('2')
  })
})
