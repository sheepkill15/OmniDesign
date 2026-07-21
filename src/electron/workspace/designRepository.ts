import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const initialHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OmniDesign</title>
    <!-- Tailwind and Alpine.js are provided locally by OmniDesign when the design is compiled; no
         imports are needed. Use Tailwind utility classes and Alpine directives directly. -->
  </head>
  <body class="min-h-screen bg-white text-slate-900 antialiased">
  </body>
</html>
`

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
    }

    const entryPath = path.join(repositoryPath, 'index.html')
    if (!existsSync(entryPath)) {
      writeFileSync(entryPath, initialHtml, { encoding: 'utf8', flag: 'wx' })
      this.commit(repositoryPath, 'Initialize design workspace')
    }

    return repositoryPath
  }

  public commitIndexHtml(designId: string, html: string, message: string): string | null {
    const repositoryPath = this.initialize(designId)
    const entryPath = path.join(repositoryPath, 'index.html')
    if (readFileSync(entryPath, 'utf8') === html) return null
    writeFileSync(entryPath, html, 'utf8')
    this.commit(repositoryPath, message)
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  public captureWorkingTree(designId: string, message: string): string {
    const repositoryPath = this.initialize(designId)
    this.commit(repositoryPath, message)
    return this.run(repositoryPath, ['rev-parse', 'HEAD'])
  }

  public readIndexHtml(designId: string): string {
    return readFileSync(path.join(this.initialize(designId), 'index.html'), 'utf8')
  }

  private commit(repositoryPath: string, message: string): void {
    this.run(repositoryPath, ['add', '--all'])
    const staged = this.runAllowingFailure(repositoryPath, ['diff', '--cached', '--quiet'])
    if (staged.status === 0) return
    if (staged.status !== 1) throw new Error(`Could not inspect Git changes: ${staged.error}`)
    this.run(repositoryPath, ['commit', '--no-gpg-sign', '-m', message])
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
        output: execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
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
