import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'

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

  public constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.read(chunk))
    child.on('error', (error) => this.finish(error))
    child.on('exit', (code) => this.finish(new Error(`Provider process exited (${code ?? 'unknown'}).`)))
  }

  public request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  public notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  public onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public close(): void { this.child.kill() }

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

export function startJsonRpcProcess(command: string, args: readonly string[]): JsonRpcProcess {
  return new JsonRpcProcess(spawn(command, args, { stdio: 'pipe', windowsHide: true }))
}
