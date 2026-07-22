import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolveInstalledCommand, runCommand } from '../provider/command.js'

export interface GitCloneActivity {
  readonly level: 'progress' | 'error'
  readonly detail: string
}

export function cloneDirectoryName(remoteUrl: string): string {
  const name = remoteUrl.trim().replace(/[\\/]$/, '').split(/[\\/:]/).at(-1)?.replace(/\.git$/i, '') ?? ''
  if (!name || name === '.' || name === '..' || /[<>:"|?*]/.test(name)) throw new Error('Git repository URL must include a valid repository name.')
  return name
}

export async function cloneRepository(remoteUrl: string, destinationDirectory: string, onActivity: (activity: GitCloneActivity) => void): Promise<string> {
  if (!existsSync(destinationDirectory) || !statSync(destinationDirectory).isDirectory()) {
    throw new Error('Choose an existing destination folder for the cloned repository.')
  }
  const destinationPath = path.join(destinationDirectory, cloneDirectoryName(remoteUrl))
  if (existsSync(destinationPath)) throw new Error(`The clone destination already exists: ${destinationPath}`)
  const git = await resolveInstalledCommand('git', 'Git executable')
  onActivity({ level: 'progress', detail: 'Starting Git clone…' })
  const result = await runCommand(git, ['clone', '--progress', remoteUrl, destinationPath], {
    onStdoutLine: (detail) => onActivity({ level: 'progress', detail }),
    onStderrLine: (detail) => onActivity({ level: 'progress', detail }),
  })
  if (result.code === 0) {
    onActivity({ level: 'progress', detail: 'Repository cloned successfully.' })
    return destinationPath
  }
  const diagnostic = (result.stderr || result.stdout).trim() || `git clone exited with code ${result.code ?? 'unknown'}.`
  onActivity({ level: 'error', detail: diagnostic })
  throw new Error(`Git clone failed: ${diagnostic}`)
}
