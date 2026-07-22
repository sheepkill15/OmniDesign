import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveProviderCommand: vi.fn(),
  runCommand: vi.fn(),
  startJsonRpcProcess: vi.fn(),
}))

vi.mock('./command.js', () => ({
  resolveProviderCommand: mocks.resolveProviderCommand,
  runCommand: mocks.runCommand,
}))
vi.mock('./jsonRpcProcess.js', () => ({ startJsonRpcProcess: mocks.startJsonRpcProcess }))

import { ClaudeAdapter } from './claudeAdapter.js'
import { CodexAdapter } from './codexAdapter.js'

describe('real provider adapter contracts', () => {
  it('runs a standalone Codex prompt read-only and normalizes streamed output', async () => {
    let notify: ((method: string, params: unknown) => void) | undefined
    const rpc = {
      request: vi.fn(async (method: string) => {
        if (method === 'thread/start') return { thread: { id: 'thread-1' } }
        if (method === 'turn/start') {
          queueMicrotask(() => {
            notify?.('item/agentMessage/delta', { delta: 'Short answer' })
            notify?.('turn/completed', {})
          })
        }
        return {}
      }),
      notify: vi.fn(),
      onNotification: vi.fn((listener: (method: string, params: unknown) => void) => { notify = listener; return () => undefined }),
      close: vi.fn(),
    }
    mocks.resolveProviderCommand.mockResolvedValue('codex')
    mocks.startJsonRpcProcess.mockReturnValue(rpc)
    const activity = vi.fn()

    await expect(new CodexAdapter().prompt({ modelId: 'gpt-5.6', prompt: 'Name this design', workspacePath: 'C:\\workspace\\design', referencePaths: ['C:\\projects\\aurora'] }, activity)).resolves.toEqual({ modelId: 'gpt-5.6', text: 'Short answer' })

    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ sandbox: 'workspace-write', approvalPolicy: 'never', runtimeWorkspaceRoots: ['C:\\workspace\\design', 'C:\\projects\\aurora'] }))
    expect(rpc.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ sandboxPolicy: { type: 'workspaceWrite', networkAccess: true, writableRoots: [] }, runtimeWorkspaceRoots: ['C:\\workspace\\design', 'C:\\projects\\aurora'] }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ kind: 'text', detail: 'Short answer' }))
  })

  it('runs a standalone Claude prompt in plan mode and passes cancellation through', async () => {
    mocks.resolveProviderCommand.mockResolvedValue('claude')
    mocks.runCommand.mockImplementation(async (_command: string, _args: readonly string[], options: { readonly onStdoutLine?: (line: string) => void; readonly signal?: AbortSignal }) => {
      options.onStdoutLine?.('{"type":"result","result":"Short answer"}')
      return { code: 0, stdout: '', stderr: '' }
    })
    const controller = new AbortController()
    const activity = vi.fn()

    await expect(new ClaudeAdapter().prompt({ modelId: 'haiku', prompt: 'Name this design', signal: controller.signal, workspacePath: 'C:\\workspace\\design', referencePaths: ['C:\\projects\\aurora'] }, activity)).resolves.toEqual({ modelId: 'haiku', text: 'Short answer' })

    expect(mocks.runCommand).toHaveBeenCalledWith('claude', expect.arrayContaining(['--permission-mode', 'acceptEdits', '--add-dir', 'C:\\projects\\aurora', '--no-session-persistence']), expect.objectContaining({ signal: controller.signal }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ kind: 'result', detail: 'Short answer' }))
  })
})
