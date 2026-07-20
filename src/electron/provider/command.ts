import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ResolvedCommand {
  readonly command: string
  readonly shell: boolean
}

export interface CommandResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
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
  options: { readonly input?: string; readonly timeoutMs?: number } = {},
): Promise<CommandResult> {
  const child = spawn(resolved.command, args, {
    shell: resolved.shell,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
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

export async function resolveProviderCommand(command: string): Promise<ResolvedCommand> {
  const candidates = process.platform === 'win32' ? await windowsCandidates(command) : [command]
  for (const candidate of candidates) {
    const resolved = { command: candidate, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate) }
    try {
      const probe = await runCommand(resolved, ['--version'], { timeoutMs: 8_000 })
      if (probe.code === 0) return resolved
    } catch {
      continue
    }
  }
  throw new Error(`${command} CLI is not installed, executable, or available on Electron's PATH.`)
}
