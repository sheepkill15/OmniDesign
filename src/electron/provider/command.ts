import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SHELL_ENV_BEGIN = '__OMNIDESIGN_SHELL_ENV_BEGIN__'
const SHELL_ENV_END = '__OMNIDESIGN_SHELL_ENV_END__'
let macOsShellPathPromise: Promise<string | undefined> | undefined

export interface ResolvedCommand {
  readonly command: string
  readonly kind: 'direct' | 'cmd-shim'
  readonly environmentPath?: string
}

export interface CommandResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

interface SpawnInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly windowsVerbatimArguments: boolean
}

function uniqueNonEmpty(lines: readonly string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
}

async function windowsCandidates(command: string): Promise<string[]> {
  try {
    const result = await execFileAsync('where.exe', [command], { windowsHide: true })
    return uniqueNonEmpty(result.stdout.split(/\r?\n/))
  } catch {
    return []
  }
}

export function extractMacOsShellPath(output: string): string | undefined {
  const start = output.lastIndexOf(SHELL_ENV_BEGIN)
  if (start < 0) return undefined
  const end = output.indexOf(SHELL_ENV_END, start + SHELL_ENV_BEGIN.length)
  if (end < 0) return undefined
  const environment = output.slice(start + SHELL_ENV_BEGIN.length, end)
  return environment.split(/\r?\n/).find((line) => line.startsWith('PATH='))?.slice('PATH='.length).trim() || undefined
}

export function mergeUnixPaths(...values: readonly (string | undefined)[]): string | undefined {
  const entries = uniqueNonEmpty(values.flatMap((value) => value?.split(':') ?? []))
  return entries.length ? entries.join(':') : undefined
}

async function readMacOsShellPath(): Promise<string | undefined> {
  if (process.platform !== 'darwin') return undefined
  macOsShellPathPromise ??= (async () => {
    const shell = process.env.SHELL?.startsWith('/') ? process.env.SHELL : '/bin/zsh'
    try {
      const command = `/usr/bin/printf '${SHELL_ENV_BEGIN}\\n'; /usr/bin/env; /usr/bin/printf '${SHELL_ENV_END}\\n'`
      const result = await execFileAsync(shell, ['-ilc', command], { timeout: 5_000, windowsHide: true })
      return extractMacOsShellPath(result.stdout)
    } catch {
      return undefined
    }
  })()
  return macOsShellPathPromise
}

export function commandEnvironment(resolved: ResolvedCommand): NodeJS.ProcessEnv | undefined {
  return resolved.environmentPath ? { ...process.env, PATH: resolved.environmentPath } : undefined
}

export async function runCommand(
  resolved: ResolvedCommand,
  args: readonly string[],
  options: {
    readonly cwd?: string
    readonly input?: string
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
    readonly onStdoutLine?: (line: string) => void
    readonly onStderrLine?: (line: string) => void
  } = {},
): Promise<CommandResult> {
  if (options.signal?.aborted) return Promise.reject(new Error('Provider command was cancelled.'))
  const invocation = resolveSpawnInvocation(resolved, args)
  const env = commandEnvironment(resolved)
  const child = spawn(invocation.command, invocation.args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(env ? { env } : {}),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let stdoutRemainder = ''
  let stderrRemainder = ''
  child.stdout.on('data', (chunk: Buffer) => {
    stdout.push(chunk)
    stdoutRemainder = emitLines(stdoutRemainder, chunk.toString('utf8'), options.onStdoutLine)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr.push(chunk)
    stderrRemainder = emitLines(stderrRemainder, chunk.toString('utf8'), options.onStderrLine)
  })
  if (options.input !== undefined) child.stdin.end(options.input)
  else child.stdin.end()

  return new Promise<CommandResult>((resolve, reject) => {
    let timedOut = false
    let cancelled = false
    let settled = false
    const finish = (complete: () => void) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', cancel)
      complete()
    }
    const timeout = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeoutMs)
    const cancel = () => {
      cancelled = true
      child.kill()
    }
    options.signal?.addEventListener('abort', cancel, { once: true })
    child.on('error', (error) => {
      finish(() => reject(error))
    })
    child.on('close', (code) => {
      finish(() => {
        if (stdoutRemainder && options.onStdoutLine) options.onStdoutLine(stdoutRemainder)
        if (stderrRemainder && options.onStderrLine) options.onStderrLine(stderrRemainder)
        const output = {
          code,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }
        if (cancelled) reject(new Error('Provider command was cancelled.'))
        else if (timedOut) reject(new Error(`Provider command timed out after ${options.timeoutMs}ms.`))
        else resolve(output)
      })
    })
  })
}

function emitLines(remainder: string, chunk: string, listener?: (line: string) => void): string {
  const lines = `${remainder}${chunk}`.split(/\r\n|\r|\n/)
  const nextRemainder = lines.pop() ?? ''
  if (listener) for (const line of lines) if (line) listener(line)
  return nextRemainder
}

function quoteCmdToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"`
}

export function resolveSpawnInvocation(resolved: ResolvedCommand, args: readonly string[]): SpawnInvocation {
  if (resolved.kind === 'direct') return { command: resolved.command, args, windowsVerbatimArguments: false }
  const commandLine = [resolved.command, ...args].map(quoteCmdToken).join(' ')
  return {
    command: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    windowsVerbatimArguments: true,
  }
}

export async function resolveInstalledCommand(command: string, displayName = `${command} CLI`): Promise<ResolvedCommand> {
  const candidates = process.platform === 'win32' ? await windowsCandidates(command) : [command]
  const environmentPath = process.platform === 'darwin'
    ? mergeUnixPaths(await readMacOsShellPath(), process.env.PATH)
    : undefined
  for (const candidate of candidates) {
    const resolved: ResolvedCommand = {
      command: candidate,
      kind: process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate) ? 'cmd-shim' : 'direct',
      ...(environmentPath ? { environmentPath } : {}),
    }
    try {
      const probe = await runCommand(resolved, ['--version'], { timeoutMs: 8_000 })
      if (probe.code === 0) return resolved
    } catch {
      continue
    }
  }
  throw new Error(`${displayName} is not installed, executable, or available on OmniDesign's PATH.`)
}

export async function resolveProviderCommand(command: string): Promise<ResolvedCommand> {
  return resolveInstalledCommand(command, `${command} CLI`)
}
