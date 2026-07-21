import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DesignRepositoryManager } from './designRepository.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function newManager(): DesignRepositoryManager {
  const artifactsDirectory = mkdtempSync(path.join(tmpdir(), 'omnidesign-repository-'))
  directories.push(artifactsDirectory)
  return new DesignRepositoryManager(artifactsDirectory)
}

describe('DesignRepositoryManager', () => {
  it('initializes a Git repository with a prepared entry page and committed build assets', () => {
    const manager = newManager()

    const repositoryPath = manager.initialize('design-1')

    expect(readFileSync(path.join(repositoryPath, 'index.html'), 'utf8')).toContain('<!doctype html>')
    expect(readFileSync(path.join(repositoryPath, 'index.html'), 'utf8')).toContain('.build/tailwind.css')
    expect(readFileSync(path.join(repositoryPath, '.build', 'alpine.js'), 'utf8')).toContain('Alpine')
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim()).toBe('1')
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repositoryPath, encoding: 'utf8' })).toBe('')
  })

  it('commits a revision (entry page + compiled CSS) and ignores unchanged content', () => {
    const manager = newManager()
    const html = '<!doctype html><html><head><link rel="stylesheet" href=".build/tailwind.css"></head><body class="p-4">Updated</body></html>'
    const css = '.p-4{padding:1rem}'

    const commit = manager.commitRevision('design-2', html, css, 'Update design')

    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect(manager.commitRevision('design-2', html, css, 'Duplicate update')).toBeNull()
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: manager.getPath('design-2'), encoding: 'utf8' }).trim()).toBe('2')
  })

  it('commits an agent working-tree edit (index.html authored in place) with a refreshed stylesheet', () => {
    const manager = newManager()
    const repositoryPath = manager.initialize('design-3')
    const html = '<!doctype html><html><head><link rel="stylesheet" href=".build/tailwind.css"></head><body class="p-4">Agent edit</body></html>'
    writeFileSync(path.join(repositoryPath, 'index.html'), html, 'utf8')

    const commit = manager.commitRevision('design-3', null, '.p-4{padding:1rem}', 'Capture agent edit')

    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect(manager.readIndexHtml('design-3')).toBe(html)
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repositoryPath, encoding: 'utf8' })).toBe('')
  })

  it('reads a revision back from its Git commit', () => {
    const manager = newManager()
    const html = '<!doctype html><html><head><link rel="stylesheet" href=".build/tailwind.css"></head><body class="p-4">Snapshot</body></html>'
    const commit = manager.commitRevision('design-4', html, '.p-4{padding:1rem}', 'Snapshot')
    expect(commit).not.toBeNull()

    const files = manager.readRevisionFiles('design-4', commit as string)
    expect(files['index.html']).toBe(html)
    expect(files['.build/tailwind.css']).toBe('.p-4{padding:1rem}')
    expect(files['.build/alpine.js']).toContain('Alpine')
  })
})
