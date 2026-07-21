import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { alpineRuntimeBase64 } from './alpineRuntime.js'

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

export class DesignRepositoryManager {
  public constructor(private readonly artifactsDirectory: string) {}

  public getPath(designId: string): string {
    return path.join(this.artifactsDirectory, designId, 'repository')
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

  /**
   * Persist a revision as a Git commit. `indexHtml` is written when provided (the mock provider owns
   * the whole document); agents author index.html themselves, so it is omitted and only the compiled
   * stylesheet is refreshed. Returns the resulting commit SHA, or null when nothing changed.
   */
  public commitRevision(designId: string, indexHtml: string | null, tailwindCss: string, message: string): string | null {
    const repositoryPath = this.initialize(designId)
    if (indexHtml !== null) this.writeFile(repositoryPath, ENTRY_HTML_PATH, indexHtml)
    this.writeFile(repositoryPath, TAILWIND_CSS_PATH, tailwindCss)
    this.writeFile(repositoryPath, ALPINE_JS_PATH, alpineRuntime)
    if (!this.commit(repositoryPath, message)) return null
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  public readIndexHtml(designId: string): string {
    return readFileSync(path.join(this.initialize(designId), ENTRY_HTML_PATH), 'utf8')
  }

  /** Check out an earlier revision's commit (detached HEAD) so the working tree reflects it. */
  public checkoutRevision(designId: string, commit: string): void {
    this.run(this.initialize(designId), ['checkout', '--force', commit])
  }

  /** Return the working tree to the head of the main timeline, discarding any transient checkout. */
  public checkoutMain(designId: string): void {
    this.run(this.initialize(designId), ['checkout', '--force', 'main'])
  }

  /** Read the files that make up a revision (entry page + build assets) from its Git commit. */
  public readRevisionFiles(designId: string, commit: string): RevisionFiles {
    const repositoryPath = this.initialize(designId)
    const files: Record<string, string> = {}
    for (const relativePath of [ENTRY_HTML_PATH, TAILWIND_CSS_PATH, ALPINE_JS_PATH]) {
      const content = this.showFileAtCommit(repositoryPath, commit, relativePath)
      if (content !== null) files[relativePath] = content
    }
    return files
  }

  /**
   * Restore a past revision as a new head commit on the main timeline: return to main, bring that
   * commit's tree into the working tree, and commit it forward. Earlier revisions are preserved.
   */
  public restore(designId: string, commit: string, message: string): string {
    const repositoryPath = this.initialize(designId)
    this.run(repositoryPath, ['checkout', '--force', 'main'])
    this.run(repositoryPath, ['checkout', commit, '--', '.'])
    this.commit(repositoryPath, message)
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  private writeFile(repositoryPath: string, relativePath: string, content: string): void {
    const target = path.join(repositoryPath, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
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
