import { describe, expect, it } from 'vitest'
import { resolveSpawnInvocation } from './command.js'

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
})
