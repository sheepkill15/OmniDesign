import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    const runtime = readFileSync(path.join(repositoryPath, '.build', 'alpine.js'), 'utf8')
    expect(runtime).toContain('Alpine')
    // The bundled collapse plugin registers itself so x-collapse works with no extra setup.
    expect(runtime).toContain('alpine:init')
    expect(runtime).toContain('"collapse"')
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

  it('reads back every file of a multi-file, multi-page revision', () => {
    const manager = newManager()
    const repositoryPath = manager.initialize('design-5')
    writeFileSync(path.join(repositoryPath, 'index.html'), '<html><body>Home</body></html>', 'utf8')
    writeFileSync(path.join(repositoryPath, 'about.html'), '<html><body>About</body></html>', 'utf8')
    mkdirSync(path.join(repositoryPath, 'assets'), { recursive: true })
    writeFileSync(path.join(repositoryPath, 'assets', 'app.js'), 'console.log("hi")', 'utf8')

    const commit = manager.commitRevision('design-5', null, '.p-4{padding:1rem}', 'Multi-file revision')
    expect(commit).not.toBeNull()

    const files = manager.readRevisionFiles('design-5', commit as string)
    expect(files['index.html']).toBe('<html><body>Home</body></html>')
    expect(files['about.html']).toBe('<html><body>About</body></html>')
    expect(files['assets/app.js']).toBe('console.log("hi")')
    expect(files['.build/tailwind.css']).toBe('.p-4{padding:1rem}')
  })

  it('compares authored files between revisions without managed build noise', () => {
    const manager = newManager()
    const first = manager.commitGeneratedRevision('design-compare', {
      'index.html': '<html>Home</html>',
      'about.html': '<html>About</html>',
      'old.js': 'old()\n',
    }, '.old{color:red}', 'First')!
    const second = manager.commitGeneratedRevision('design-compare', {
      'index.html': '<html>Updated home</html>',
      'about.html': '<html>About</html>',
      'new.js': 'new()\n',
    }, '.new{color:blue}', 'Second')!

    const comparison = manager.compareRevisions('design-compare', first, second, 'revision-1', 'revision-2')
    expect(comparison).toMatchObject({ baseRevisionId: 'revision-1', targetRevisionId: 'revision-2', additions: 2, deletions: 2 })
    expect(comparison.files).toEqual([
      { path: 'index.html', status: 'modified', additions: 1, deletions: 1 },
      { path: 'new.js', status: 'added', additions: 1, deletions: 0 },
      { path: 'old.js', status: 'removed', additions: 0, deletions: 1 },
    ])
  })

  it('reads the current working tree (all agent-authored files) before a commit', () => {
    const manager = newManager()
    const repositoryPath = manager.initialize('design-6')
    writeFileSync(path.join(repositoryPath, 'about.html'), '<html><body>About</body></html>', 'utf8')

    const files = manager.readWorkingTreeFiles('design-6')
    expect(files['index.html']).toContain('<!doctype html>')
    expect(files['about.html']).toBe('<html><body>About</body></html>')
    // The .git directory is never surfaced as a design file.
    expect(Object.keys(files).some((relativePath) => relativePath.startsWith('.git/'))).toBe(false)
  })
})
