import { describe, expect, it } from 'vitest'
import { resolveSpawnInvocation, runCommand } from './command.js'

describe('resolveSpawnInvocation', () => {
  it('launches Windows command shims through cmd without shell mode', () => {
    const invocation = resolveSpawnInvocation(
      { command: 'C:\\Users\\Example User\\AppData\\Roaming\\npm\\codex.cmd', kind: 'cmd-shim' },
      ['app-server'],
    )

    expect(invocation.command.toLowerCase()).toContain('cmd.exe')
    expect(invocation).toEqual({
      command: expect.stringContaining('cmd.exe'),
      windowsVerbatimArguments: true,
      args: [
      '/d',
      '/s',
      '/c',
      '""C:\\Users\\Example User\\AppData\\Roaming\\npm\\codex.cmd" "app-server""',
      ],
    })
  })

  it('does not start a provider command after its request is cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(runCommand(
      { command: process.execPath, kind: 'direct' },
      ['--version'],
      { signal: controller.signal },
    )).rejects.toThrow('cancelled')
  })

  it('terminates a running provider command when its request is cancelled', async () => {
    const controller = new AbortController()
    const command = runCommand(
      { command: process.execPath, kind: 'direct' },
      ['-e', 'setTimeout(() => undefined, 60_000)'],
      { signal: controller.signal },
    )
    controller.abort()

    await expect(command).rejects.toThrow('cancelled')
  })
})
