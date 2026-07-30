import { resolveInstalledCommand, runCommand } from '../provider/command.js'

export type LocalDependencyId = 'git'

export interface LocalDependencyStatus {
  readonly id: LocalDependencyId
  readonly name: string
  readonly installed: boolean
  readonly required: boolean
  readonly detail: string
}

type DependencyProbe = (command: string) => Promise<string>

const setupUrls: Readonly<Record<LocalDependencyId, Readonly<Record<'win32' | 'darwin' | 'linux' | 'other', string>>>> = {
  git: {
    win32: 'https://git-scm.com/install/windows',
    darwin: 'https://git-scm.com/install/mac',
    linux: 'https://git-scm.com/install/linux',
    other: 'https://git-scm.com/downloads',
  },
}

async function probeInstalledCommand(command: string): Promise<string> {
  const resolved = await resolveInstalledCommand(command, 'Git executable')
  const result = await runCommand(resolved, ['--version'], { timeoutMs: 8_000 })
  if (result.code !== 0) throw new Error(result.stderr.trim() || `${command} --version failed.`)
  return result.stdout.trim()
}

export async function discoverLocalDependencies(probe: DependencyProbe = probeInstalledCommand): Promise<LocalDependencyStatus[]> {
  try {
    const version = await probe('git')
    return [{
      id: 'git',
      name: 'Git',
      installed: true,
      required: true,
      detail: version ? `${version} is available for design history and project cloning.` : 'Git is available for design history and project cloning.',
    }]
  } catch {
    return [{
      id: 'git',
      name: 'Git',
      installed: false,
      required: true,
      detail: 'Git is required for design history and project cloning, but it is not available on OmniDesign\'s PATH.',
    }]
  }
}

export function isLocalDependencyId(value: unknown): value is LocalDependencyId {
  return value === 'git'
}

export function localDependencySetupUrl(dependencyId: LocalDependencyId, platform: string): string {
  const platformKey = platform === 'win32' || platform === 'darwin' || platform === 'linux' ? platform : 'other'
  return setupUrls[dependencyId][platformKey]
}
