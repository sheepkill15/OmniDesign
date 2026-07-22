import { resolveInstalledCommand, runCommand } from '../provider/command.js'

export interface GitCloneActivity {
  readonly level: 'progress' | 'error'
  readonly detail: string
}

export async function cloneRepository(remoteUrl: string, destinationPath: string, onActivity: (activity: GitCloneActivity) => void): Promise<void> {
  const git = await resolveInstalledCommand('git', 'Git executable')
  onActivity({ level: 'progress', detail: 'Starting Git clone…' })
  const result = await runCommand(git, ['clone', '--progress', remoteUrl, destinationPath], {
    onStdoutLine: (detail) => onActivity({ level: 'progress', detail }),
    onStderrLine: (detail) => onActivity({ level: 'progress', detail }),
  })
  if (result.code === 0) {
    onActivity({ level: 'progress', detail: 'Repository cloned successfully.' })
    return
  }
  const diagnostic = (result.stderr || result.stdout).trim() || `git clone exited with code ${result.code ?? 'unknown'}.`
  onActivity({ level: 'error', detail: diagnostic })
  throw new Error(`Git clone failed: ${diagnostic}`)
}
