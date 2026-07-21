import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ResolvedCommand {
  readonly command: string
  readonly kind: 'direct' | 'cmd-shim'
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

export async function runCommand(
  resolved: ResolvedCommand,
  args: readonly string[],
  options: {
    readonly cwd?: string
    readonly input?: string
    readonly timeoutMs?: number
    readonly onStdoutLine?: (line: string) => void
    readonly onStderrLine?: (line: string) => void
  } = {},
): Promise<CommandResult> {
  const invocation = resolveSpawnInvocation(resolved, args)
  const child = spawn(invocation.command, invocation.args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
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
    const timeout = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true
      child.kill()
    }, options.timeoutMs)
    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      if (stdoutRemainder && options.onStdoutLine) options.onStdoutLine(stdoutRemainder)
      if (stderrRemainder && options.onStderrLine) options.onStderrLine(stderrRemainder)
      const output = {
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (timedOut) {
        reject(new Error(`Provider command timed out after ${options.timeoutMs}ms.`))
      } else {
        resolve(output)
      }
    })
  })
}

function emitLines(remainder: string, chunk: string, listener?: (line: string) => void): string {
  const lines = `${remainder}${chunk}`.split(/\r?\n/)
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

export async function resolveProviderCommand(command: string): Promise<ResolvedCommand> {
  const candidates = process.platform === 'win32' ? await windowsCandidates(command) : [command]
  for (const candidate of candidates) {
    const resolved: ResolvedCommand = {
      command: candidate,
      kind: process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate) ? 'cmd-shim' : 'direct',
    }
    try {
      const probe = await runCommand(resolved, ['--version'], { timeoutMs: 8_000 })
      if (probe.code === 0) return resolved
    } catch {
      continue
    }
  }
  throw new Error(`${command} CLI is not installed, executable, or available on Electron's PATH.`)
}
