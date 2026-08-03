import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { commandEnvironment, resolveSpawnInvocation } from './command.js'
import type { ResolvedCommand } from './command.js'

interface JsonRpcMessage {
  readonly id?: number
  readonly method?: string
  readonly params?: unknown
  readonly result?: unknown
  readonly error?: { readonly message?: string }
}

export class JsonRpcProcess {
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>()
  private readonly listeners = new Set<(method: string, params: unknown) => void>()
  private nextId = 1
  private buffer = ''
  private stderrTail = ''

  public constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.read(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-8_000)
    })
    child.on('error', (error) => this.finish(error))
    child.on('exit', (code) => {
      const detail = this.stderrTail.trim()
      this.finish(new Error(`Provider process exited (${code ?? 'unknown'}).${detail ? ` ${detail}` : ''}`))
    })
  }

  public request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  public notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`)
  }

  public onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public close(reason = new Error('Provider process was closed.')): void {
    this.finish(reason)
    this.child.kill()
  }

  private read(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try { this.handle(JSON.parse(line) as JsonRpcMessage) } catch { /* ignore non-protocol diagnostics */ }
    }
  }

  private handle(message: JsonRpcMessage): void {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message ?? 'Provider request failed.'))
      else pending.resolve(message.result)
      return
    }
    if (message.method) for (const listener of this.listeners) listener(message.method, message.params)
  }

  private finish(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

export function startJsonRpcProcess(resolved: ResolvedCommand, args: readonly string[], options: { readonly cwd?: string } = {}): JsonRpcProcess {
  const invocation = resolveSpawnInvocation(resolved, args)
  const env = commandEnvironment(resolved)
  return new JsonRpcProcess(spawn(invocation.command, invocation.args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(env ? { env } : {}),
    stdio: 'pipe',
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  }))
}
