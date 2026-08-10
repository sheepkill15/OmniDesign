import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { alpineRuntimeBase64 } from './alpineRuntime.js'
import type { RevisionComparison } from './contracts.js'

// Compiled Tailwind CSS and the vendored Alpine runtime live in this committed folder; index.html
// links to them. Agents are told to leave it alone — OmniDesign regenerates it on every revision.
export const BUILD_DIR = '.build'
export const TAILWIND_CSS_PATH = `${BUILD_DIR}/tailwind.css`
export const ALPINE_JS_PATH = `${BUILD_DIR}/alpine.js`
export const ENTRY_HTML_PATH = 'index.html'

const alpineRuntime = Buffer.from(alpineRuntimeBase64, 'base64').toString('utf8')

const initialHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OmniDesign</title>
    <!-- OmniDesign generates ${BUILD_DIR}/ (compiled Tailwind + Alpine). Do not edit that folder; keep these links. -->
    <link rel="stylesheet" href="${TAILWIND_CSS_PATH}">
    <script defer src="${ALPINE_JS_PATH}"></script>
  </head>
  <body class="min-h-screen bg-white text-slate-900 antialiased">
  </body>
</html>
`

export interface RevisionFiles {
  readonly [relativePath: string]: string
}

export interface DesignWorktree {
  readonly path: string
  readonly head: string
  readonly branch: string | null
  readonly locked: boolean
  readonly prunable: boolean
}

const managedIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
const commitPattern = /^[0-9a-f]{40}$/

export class DesignRepositoryManager {
  public constructor(private readonly artifactsDirectory: string) {}

  public getPath(designId: string): string {
    this.validateManagedId(designId, 'design')
    return path.join(this.artifactsDirectory, designId, 'repository')
  }

  public getBranchPath(designId: string, branchId: string): string {
    this.validateManagedId(designId, 'design')
    this.validateManagedId(branchId, 'branch')
    return this.resolveInsideDesignRoot(designId, 'branches', branchId, 'worktree')
  }

  public getBranchRef(branchId: string): string {
    this.validateManagedId(branchId, 'branch')
    return `refs/heads/od/${branchId}`
  }

  public getWorkingPath(designId: string, branchId = designId): string {
    return branchId === designId ? this.initialize(designId) : this.requireRegisteredBranchWorktree(designId, branchId).path
  }

  public initialize(designId: string): string {
    const repositoryPath = this.getPath(designId)
    mkdirSync(repositoryPath, { recursive: true })

    if (!existsSync(path.join(repositoryPath, '.git'))) {
      this.run(repositoryPath, ['init', '--initial-branch=main'])
      this.run(repositoryPath, ['config', 'user.name', 'OmniDesign'])
      this.run(repositoryPath, ['config', 'user.email', 'omnidesign@local'])
      // Keep generated files byte-exact: never rewrite line endings on commit or checkout.
      this.run(repositoryPath, ['config', 'core.autocrlf', 'false'])
    }

    if (!existsSync(path.join(repositoryPath, ENTRY_HTML_PATH))) {
      this.writeFile(repositoryPath, ENTRY_HTML_PATH, initialHtml)
      this.writeFile(repositoryPath, TAILWIND_CSS_PATH, '')
      this.writeFile(repositoryPath, ALPINE_JS_PATH, alpineRuntime)
      this.commit(repositoryPath, 'Initialize design workspace')
    }

    return repositoryPath
  }

  public listWorktrees(designId: string): DesignWorktree[] {
    const repositoryPath = this.initialize(designId)
    const output = this.run(repositoryPath, ['worktree', 'list', '--porcelain', '-z'])
    const worktrees: DesignWorktree[] = []
    let current: { path?: string; head?: string; branch?: string | null; locked?: boolean; prunable?: boolean } = {}
    const finish = () => {
      if (!current.path) return
      worktrees.push({
        path: path.resolve(current.path),
        head: current.head ?? '',
        branch: current.branch ?? null,
        locked: current.locked ?? false,
        prunable: current.prunable ?? false,
      })
      current = {}
    }
    for (const field of output.split('\0')) {
      if (!field) { finish(); continue }
      const separator = field.indexOf(' ')
      const key = separator === -1 ? field : field.slice(0, separator)
      const value = separator === -1 ? '' : field.slice(separator + 1)
      if (key === 'worktree') { finish(); current.path = value }
      else if (key === 'HEAD') current.head = value
      else if (key === 'branch') current.branch = value
      else if (key === 'locked') current.locked = true
      else if (key === 'prunable') current.prunable = true
    }
    finish()
    return worktrees
  }

  public validateMainWorktree(designId: string): DesignWorktree {
    const expectedPath = path.resolve(this.initialize(designId))
    const association = this.listWorktrees(designId).find((candidate) => this.samePath(candidate.path, expectedPath))
    if (!association || (association.branch !== null && association.branch !== 'refs/heads/main')) {
      throw new Error('The Main branch worktree is not registered with its managed design repository.')
    }
    return association
  }

  public createBranchWorktree(designId: string, branchId: string, baseCommit: string): DesignWorktree {
    if (!commitPattern.test(baseCommit)) throw new Error('The branch base revision is invalid.')
    const repositoryPath = this.initialize(designId)
    const worktreePath = this.getBranchPath(designId, branchId)
    const branchName = `od/${branchId}`
    if (existsSync(worktreePath)) throw new Error('The managed branch worktree already exists.')
    if (this.runAllowingFailure(repositoryPath, ['show-ref', '--verify', '--quiet', this.getBranchRef(branchId)]).status === 0) {
      throw new Error('The managed branch ref already exists.')
    }
    mkdirSync(path.dirname(worktreePath), { recursive: true })
    this.run(repositoryPath, ['worktree', 'add', '-b', branchName, worktreePath, baseCommit])
    return this.requireRegisteredBranchWorktree(designId, branchId)
  }

  public repairBranchWorktree(designId: string, branchId: string): DesignWorktree {
    const repositoryPath = this.initialize(designId)
    const worktreePath = this.getBranchPath(designId, branchId)
    if (!existsSync(worktreePath)) throw new Error('The managed branch worktree is missing and cannot be repaired automatically.')
    this.run(repositoryPath, ['worktree', 'repair', worktreePath])
    return this.requireRegisteredBranchWorktree(designId, branchId)
  }

  public removeBranchWorktree(designId: string, branchId: string, force = false): void {
    const repositoryPath = this.initialize(designId)
    const association = this.requireRegisteredBranchWorktree(designId, branchId)
    const status = this.run(association.path, ['status', '--porcelain'])
    if (status && !force) throw new Error('This branch has unresolved or uncommitted files. Confirm removal to discard them.')
    this.run(repositoryPath, ['worktree', 'remove', ...(force ? ['--force'] : []), association.path])
    this.run(repositoryPath, ['branch', '-D', `od/${branchId}`])
  }

  /**
   * Persist a revision as a Git commit. `indexHtml` is written when provided (the mock provider owns
   * the whole document); agents author index.html themselves, so it is omitted and only the compiled
   * stylesheet is refreshed. Returns the resulting commit SHA, or null when nothing changed.
   */
  public commitRevision(designId: string, indexHtml: string | null, tailwindCss: string, message: string, branchId = designId): string | null {
    if (indexHtml !== null) return this.commitGeneratedRevision(designId, { [ENTRY_HTML_PATH]: indexHtml }, tailwindCss, message, branchId)
    const repositoryPath = this.getWorkingPath(designId, branchId)
    this.writeFile(repositoryPath, TAILWIND_CSS_PATH, tailwindCss)
    this.writeFile(repositoryPath, ALPINE_JS_PATH, alpineRuntime)
    if (!this.commit(repositoryPath, message)) return null
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  /** Replace the mock provider's authored source tree and commit it with the managed build outputs. */
  public commitGeneratedRevision(designId: string, sourceFiles: RevisionFiles, tailwindCss: string, message: string, branchId = designId): string | null {
    const repositoryPath = this.getWorkingPath(designId, branchId)
    const normalizedFiles = new Map(Object.entries(sourceFiles).map(([relativePath, content]) => [this.normalizeGeneratedPath(relativePath), content]))
    for (const relativePath of Object.keys(this.readWorkingTreeFiles(designId, branchId))) {
      if (relativePath.startsWith(`${BUILD_DIR}/`) || normalizedFiles.has(relativePath)) continue
      const target = path.resolve(repositoryPath, relativePath)
      if (path.dirname(target) === repositoryPath || target.startsWith(`${repositoryPath}${path.sep}`)) unlinkSync(target)
    }
    for (const [relativePath, content] of normalizedFiles) this.writeFile(repositoryPath, relativePath, content)
    this.writeFile(repositoryPath, TAILWIND_CSS_PATH, tailwindCss)
    this.writeFile(repositoryPath, ALPINE_JS_PATH, alpineRuntime)
    if (!this.commit(repositoryPath, message)) return null
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  // Clone one design's whole Git repository (history and all) to another design's storage, so a
  // duplicated design keeps every committed revision and its working tree byte-for-byte.
  public duplicateRepository(sourceDesignId: string, targetDesignId: string): void {
    const source = this.initialize(sourceDesignId)
    const target = this.getPath(targetDesignId)
    if (existsSync(path.join(target, '.git'))) throw new Error('Target design repository already exists.')
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }

  public readIndexHtml(designId: string, branchId = designId): string {
    return readFileSync(path.join(this.getWorkingPath(designId, branchId), ENTRY_HTML_PATH), 'utf8')
  }

  public writeSourceFiles(designId: string, sourceFiles: RevisionFiles, branchId = designId): void {
    const repositoryPath = this.getWorkingPath(designId, branchId)
    for (const [relativePath, content] of Object.entries(sourceFiles)) {
      if (relativePath === BUILD_DIR || relativePath.startsWith(`${BUILD_DIR}/`)) continue
      this.writeFile(repositoryPath, this.normalizeGeneratedPath(relativePath), content)
    }
  }

  /**
   * Read the design's current working-tree files (every tracked-or-untracked file the agent authored,
   * plus the managed build assets), keyed by relative path. Used to compile Tailwind across all pages
   * before a revision is committed. The .git directory is never included.
   */
  public readWorkingTreeFiles(designId: string, branchId = designId): RevisionFiles {
    const repositoryPath = this.getWorkingPath(designId, branchId)
    // -c lists tracked+untracked files while honouring .gitignore; -o adds untracked; --exclude-standard
    // keeps ignored noise out. Together they enumerate exactly the files a commit would capture.
    const listing = this.run(repositoryPath, ['ls-files', '--cached', '--others', '--exclude-standard'])
    const files: Record<string, string> = {}
    for (const relativePath of listing.split('\n').map((line) => line.trim()).filter(Boolean)) {
      const target = path.join(repositoryPath, relativePath)
      if (existsSync(target)) files[relativePath] = readFileSync(target, 'utf8')
    }
    return files
  }

  /** Check out an earlier revision's commit (detached HEAD) so the working tree reflects it. */
  public checkoutRevision(designId: string, commit: string, branchId = designId): void {
    this.run(this.getWorkingPath(designId, branchId), ['checkout', '--force', commit])
  }

  /** Return one worktree to its product branch head, discarding any transient historical checkout. */
  public checkoutBranchHead(designId: string, branchId = designId): void {
    const branchName = branchId === designId ? 'main' : `od/${branchId}`
    this.run(this.getWorkingPath(designId, branchId), ['checkout', '--force', branchName])
  }

  public checkoutMain(designId: string): void {
    this.checkoutBranchHead(designId, designId)
  }

  /**
   * Read every file that makes up a revision from its Git commit — all agent-authored pages, assets,
   * fonts, and per-page scripts alongside the managed build outputs. This is what feeds both the
   * preview and the offline export, so multi-file and multi-page designs round-trip in full.
   */
  public readRevisionFiles(designId: string, commit: string): RevisionFiles {
    const repositoryPath = this.initialize(designId)
    const listing = this.run(repositoryPath, ['ls-tree', '-r', '--name-only', commit])
    const files: Record<string, string> = {}
    for (const relativePath of listing.split('\n').map((line) => line.trim()).filter(Boolean)) {
      const content = this.showFileAtCommit(repositoryPath, commit, relativePath)
      if (content !== null) files[relativePath] = content
    }
    return files
  }

  public compareRevisions(designId: string, baseCommit: string, targetCommit: string, baseRevisionId: string, targetRevisionId: string): RevisionComparison {
    const repositoryPath = this.initialize(designId)
    const statuses = new Map<string, RevisionComparison['files'][number]['status']>()
    for (const line of this.run(repositoryPath, ['diff', '--name-status', '--no-renames', baseCommit, targetCommit, '--']).split('\n').filter(Boolean)) {
      const [code, relativePath] = line.split('\t')
      if (!relativePath || relativePath.startsWith(`${BUILD_DIR}/`)) continue
      statuses.set(relativePath, code === 'A' ? 'added' : code === 'D' ? 'removed' : 'modified')
    }
    const stats = new Map<string, { additions: number | null; deletions: number | null }>()
    for (const line of this.run(repositoryPath, ['diff', '--numstat', '--no-renames', baseCommit, targetCommit, '--']).split('\n').filter(Boolean)) {
      const [added, deleted, relativePath] = line.split('\t')
      if (!relativePath || relativePath.startsWith(`${BUILD_DIR}/`)) continue
      stats.set(relativePath, { additions: added === '-' ? null : Number(added), deletions: deleted === '-' ? null : Number(deleted) })
    }
    const files = [...statuses].map(([relativePath, status]) => ({ path: relativePath, status, ...(stats.get(relativePath) ?? { additions: null, deletions: null }) }))
      .sort((left, right) => left.path.localeCompare(right.path))
    return {
      baseRevisionId,
      targetRevisionId,
      files,
      additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
      deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
    }
  }

  /**
   * Restore a past revision as a new head commit on the main timeline: return to main, bring that
   * commit's tree into the working tree, and commit it forward. Earlier revisions are preserved.
   */
  public restore(designId: string, commit: string, message: string, branchId = designId): string {
    const repositoryPath = this.getWorkingPath(designId, branchId)
    const branchName = branchId === designId ? 'main' : `od/${branchId}`
    this.run(repositoryPath, ['checkout', '--force', branchName])
    this.run(repositoryPath, ['checkout', commit, '--', '.'])
    this.commit(repositoryPath, message)
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  private writeFile(repositoryPath: string, relativePath: string, content: string): void {
    const target = path.join(repositoryPath, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }

  private normalizeGeneratedPath(relativePath: string): string {
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '')
    if (!normalized || path.posix.isAbsolute(normalized) || normalized === '.git' || normalized.startsWith('.git/') || normalized === BUILD_DIR || normalized.startsWith(`${BUILD_DIR}/`) || normalized.split('/').includes('..')) {
      throw new Error(`Invalid generated file path: ${relativePath}`)
    }
    return normalized
  }

  private requireRegisteredBranchWorktree(designId: string, branchId: string): DesignWorktree {
    const expectedPath = this.getBranchPath(designId, branchId)
    const expectedRef = this.getBranchRef(branchId)
    const association = this.listWorktrees(designId).find((candidate) => this.samePath(candidate.path, expectedPath))
    if (!association || association.branch !== expectedRef) {
      throw new Error('The managed branch worktree does not match its registered Git association.')
    }
    return association
  }

  private validateManagedId(value: string, kind: 'design' | 'branch'): void {
    if (!managedIdPattern.test(value)) throw new Error(`Invalid managed ${kind} identifier.`)
  }

  private resolveInsideDesignRoot(designId: string, ...segments: string[]): string {
    const designRoot = path.resolve(this.artifactsDirectory, designId)
    const target = path.resolve(designRoot, ...segments)
    if (target === designRoot || !target.startsWith(`${designRoot}${path.sep}`)) throw new Error('Managed branch path escaped its design root.')
    return target
  }

  private samePath(left: string, right: string): boolean {
    const normalizedLeft = path.resolve(left)
    const normalizedRight = path.resolve(right)
    return process.platform === 'win32' ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight
  }

  private showFileAtCommit(repositoryPath: string, commit: string, relativePath: string): string | null {
    const result = this.runAllowingFailure(repositoryPath, ['show', `${commit}:${relativePath}`])
    return result.status === 0 ? result.output : null
  }

  private commit(repositoryPath: string, message: string): boolean {
    this.run(repositoryPath, ['add', '--all'])
    const staged = this.runAllowingFailure(repositoryPath, ['diff', '--cached', '--quiet'])
    if (staged.status === 0) return false
    if (staged.status !== 1) throw new Error(`Could not inspect Git changes: ${staged.error}`)
    this.run(repositoryPath, ['commit', '--no-gpg-sign', '-m', message])
    return true
  }

  private run(repositoryPath: string, args: string[]): string {
    const result = this.runAllowingFailure(repositoryPath, args)
    if (result.status !== 0) throw new Error(`Git ${args[0]} failed: ${result.error}`)
    return result.output.trim()
  }

  private runAllowingFailure(repositoryPath: string, args: string[]): { status: number; output: string; error: string } {
    try {
      return {
        status: 0,
        output: execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }),
        error: '',
      }
    } catch (error) {
      const failure = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer; message: string }
      return {
        status: failure.status ?? 1,
        output: String(failure.stdout ?? ''),
        error: String(failure.stderr ?? failure.message).trim(),
      }
    }
  }
}
