import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { resolveInstalledCommand, runCommand } from '../provider/command.js'

export interface GitCloneActivity {
  readonly level: 'progress' | 'error'
  readonly detail: string
}

// Git's custom transport syntax (`ext::sh -c …`, `file::`, `fd::`) executes arbitrary local commands by
// design, and argument-like values (`-c …`, `--upload-pack=…`) would be parsed as Git options. Only HTTPS,
// SSH (URL or scp-like form), and absolute local repository paths are accepted.
const REMOTE_TRANSPORT_PATTERN = /^[a-z][a-z0-9+.-]*::/i
const REMOTE_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/
const REMOTE_SCP_LIKE_PATTERN = /^[^@/:]+@[^/:]+:\S/
const ALLOWED_REMOTE_SCHEME_PATTERN = /^(?:https?|ssh):\/\//i

export function assertSafeRemoteUrl(remoteUrl: string): string {
  const url = remoteUrl.trim()
  if (!url || url.startsWith('-')) throw new Error('Enter a valid Git repository URL.')
  if (!ALLOWED_REMOTE_SCHEME_PATTERN.test(url)
    && (REMOTE_TRANSPORT_PATTERN.test(url) || (REMOTE_SCHEME_PATTERN.test(url) && !WINDOWS_DRIVE_PATH_PATTERN.test(url)))) {
    throw new Error('This kind of Git repository URL is not supported. Use an HTTPS or SSH URL.')
  }
  const hasAllowedScheme = ALLOWED_REMOTE_SCHEME_PATTERN.test(url)
  const isLocalPath = path.isAbsolute(url) || WINDOWS_DRIVE_PATH_PATTERN.test(url)
  if (!hasAllowedScheme && !isLocalPath && !REMOTE_SCP_LIKE_PATTERN.test(url)) {
    throw new Error('Use an HTTPS or SSH URL, or the absolute path of a local repository.')
  }
  return url
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
  const safeRemoteUrl = assertSafeRemoteUrl(remoteUrl)
  const destinationPath = path.join(destinationDirectory, cloneDirectoryName(safeRemoteUrl))
  if (existsSync(destinationPath)) throw new Error(`The clone destination already exists: ${destinationPath}`)
  const git = await resolveInstalledCommand('git', 'Git executable')
  onActivity({ level: 'progress', detail: 'Starting Git clone…' })
  const result = await runCommand(git, ['clone', '--progress', '--', safeRemoteUrl, destinationPath], {
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
