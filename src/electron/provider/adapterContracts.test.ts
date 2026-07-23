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
            notify?.('thread/tokenUsage/updated', {
              tokenUsage: {
                last: { inputTokens: 1_240, outputTokens: 86, totalTokens: 1_326 },
                modelContextWindow: 200_000,
              },
            })
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

    await expect(new CodexAdapter().prompt({ modelId: 'gpt-5.6', prompt: 'Name this design', workspacePath: 'C:\\workspace\\design', referencePaths: ['C:\\projects\\aurora'] }, activity)).resolves.toEqual({ modelId: 'gpt-5.6', text: 'Short answer', sessionId: 'thread-1' })

    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ sandbox: 'workspace-write', approvalPolicy: 'never', runtimeWorkspaceRoots: ['C:\\workspace\\design', 'C:\\projects\\aurora'] }))
    expect(rpc.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ sandboxPolicy: { type: 'workspaceWrite', networkAccess: true, writableRoots: [] }, runtimeWorkspaceRoots: ['C:\\workspace\\design', 'C:\\projects\\aurora'] }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ kind: 'text', detail: 'Short answer' }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'thread-1' }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'result',
      detail: '1,240 tokens input · 86 tokens output · 200,000 tokens context',
    }))
  })

  it('resumes a persisted Codex thread for continued work', async () => {
    let notify: ((method: string, params: unknown) => void) | undefined
    const rpc = {
      request: vi.fn(async (method: string) => {
        if (method === 'thread/resume') return { thread: { id: 'thread-existing' } }
        if (method === 'turn/start') queueMicrotask(() => notify?.('turn/completed', {}))
        return {}
      }),
      notify: vi.fn(),
      onNotification: vi.fn((listener: (method: string, params: unknown) => void) => { notify = listener; return () => undefined }),
      close: vi.fn(),
    }
    mocks.resolveProviderCommand.mockResolvedValue('codex')
    mocks.startJsonRpcProcess.mockReturnValue(rpc)

    await new CodexAdapter().prompt({ modelId: 'gpt-5.6', prompt: 'Continue', workspacePath: 'C:\\workspace\\design', resumeSessionId: 'thread-existing' }, vi.fn())

    expect(rpc.request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({ threadId: 'thread-existing', excludeTurns: true }))
    expect(rpc.request).not.toHaveBeenCalledWith('thread/start', expect.anything())
  })

  it('runs a standalone Claude prompt in plan mode and passes cancellation through', async () => {
    mocks.resolveProviderCommand.mockResolvedValue('claude')
    mocks.runCommand.mockImplementation(async (_command: string, _args: readonly string[], options: { readonly onStdoutLine?: (line: string) => void; readonly signal?: AbortSignal }) => {
      options.onStdoutLine?.('{"type":"system","subtype":"init","session_id":"claude-session-1"}')
      options.onStdoutLine?.('{"type":"result","result":"Short answer","num_turns":6,"total_cost_usd":0.003,"usage":{"input_tokens":1240,"output_tokens":86}}')
      return { code: 0, stdout: '', stderr: '' }
    })
    const controller = new AbortController()
    const activity = vi.fn()

    await expect(new ClaudeAdapter().prompt({ modelId: 'haiku', prompt: 'Name this design', signal: controller.signal, workspacePath: 'C:\\workspace\\design', referencePaths: ['C:\\projects\\aurora'] }, activity)).resolves.toEqual({ modelId: 'haiku', text: 'Short answer', sessionId: 'claude-session-1' })

    expect(mocks.runCommand).toHaveBeenCalledWith('claude', expect.arrayContaining(['--permission-mode', 'acceptEdits', '--add-dir', 'C:\\projects\\aurora']), expect.objectContaining({ signal: controller.signal }))
    expect(mocks.runCommand.mock.calls[0][1]).not.toContain('--no-session-persistence')
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'claude-session-1' }))
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'result',
      detail: '6 turns · 1,240 tokens input · 86 tokens output · $0.0030',
    }))
    expect(activity).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'result', detail: 'Short answer' }))
  })

  it('resumes a persisted Claude session for continued work', async () => {
    mocks.resolveProviderCommand.mockResolvedValue('claude')
    mocks.runCommand.mockImplementation(async (_command: string, _args: readonly string[], options: { readonly onStdoutLine?: (line: string) => void }) => {
      options.onStdoutLine?.('{"type":"result","result":"Continued"}')
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(new ClaudeAdapter().prompt({ modelId: 'sonnet', prompt: 'Continue', workspacePath: 'C:\\workspace\\design', resumeSessionId: 'claude-session-1' }, vi.fn())).resolves.toMatchObject({ sessionId: 'claude-session-1' })

    expect(mocks.runCommand).toHaveBeenCalledWith('claude', expect.arrayContaining(['--resume', 'claude-session-1']), expect.any(Object))
  })
})
