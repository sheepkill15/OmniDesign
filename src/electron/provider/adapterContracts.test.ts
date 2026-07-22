import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => vi.resetAllMocks())

  it('discovers Codex authentication, models, and reasoning efforts through app-server', async () => {
    const rpc = {
      request: vi.fn(async (method: string) => {
        if (method === 'account/read') return { account: { email: 'designer@example.com' } }
        if (method === 'model/list') return { data: [{ model: 'gpt-5.6', displayName: 'GPT-5.6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }] }] }
        return {}
      }),
      notify: vi.fn(), onNotification: vi.fn(), close: vi.fn(),
    }
    mocks.resolveProviderCommand.mockResolvedValue('codex')
    mocks.startJsonRpcProcess.mockReturnValue(rpc)

    await expect(new CodexAdapter().discover()).resolves.toMatchObject({
      installed: true,
      authenticated: true,
      models: [{ id: 'gpt-5.6', name: 'GPT-5.6', effortLevels: [{ id: 'low', isDefault: false }, { id: 'medium', isDefault: true }] }],
    })
    expect(rpc.request).toHaveBeenCalledWith('account/read', {})
    expect(rpc.request).toHaveBeenCalledWith('model/list', {})
    expect(rpc.close).toHaveBeenCalledOnce()
  })

  it('discovers Claude authentication, model aliases, and effort capabilities from the installed CLI', async () => {
    mocks.resolveProviderCommand.mockResolvedValue('claude')
    mocks.runCommand.mockImplementation(async (_command: string, args: readonly string[]) => {
      if (args[0] === '--version') return { code: 0, stdout: '2.1.0\n', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: '{"loggedIn":true}', stderr: '' }
      return { code: 0, stdout: "--model <model> alias for the latest model (e.g. 'opus', 'sonnet') or a model's full name\n--effort <level> Effort level (low, medium, high)", stderr: '' }
    })

    await expect(new ClaudeAdapter().discover()).resolves.toMatchObject({
      installed: true,
      authenticated: true,
      models: [
        { id: 'opus', effortLevels: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] },
        { id: 'sonnet', effortLevels: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] },
      ],
    })
    expect(mocks.runCommand).toHaveBeenCalledWith('claude', ['auth', 'status', '--json'], expect.objectContaining({ timeoutMs: 12_000 }))
    expect(mocks.runCommand).toHaveBeenCalledWith('claude', ['--help'], expect.objectContaining({ timeoutMs: 12_000 }))
  })

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
