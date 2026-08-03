import { describe, expect, it } from 'vitest'
import { commandEnvironment, extractMacOsShellPath, mergeUnixPaths, resolveSpawnInvocation, runCommand } from './command.js'

describe('macOS command environment', () => {
  it('extracts PATH from a noisy interactive login shell environment', () => {
    const output = [
      'shell startup notice',
      '__OMNIDESIGN_SHELL_ENV_BEGIN__',
      'SHELL=/bin/zsh',
      'PATH=/Users/example/.volta/bin:/opt/homebrew/bin:/usr/bin:/bin',
      '__OMNIDESIGN_SHELL_ENV_END__',
      'shell logout notice',
    ].join('\n')

    expect(extractMacOsShellPath(output)).toBe('/Users/example/.volta/bin:/opt/homebrew/bin:/usr/bin:/bin')
    expect(extractMacOsShellPath('shell output without an environment block')).toBeUndefined()
  })

  it('merges shell and launch paths without duplicate entries', () => {
    expect(mergeUnixPaths(
      '/Users/example/.local/bin:/opt/homebrew/bin:/usr/bin',
      '/usr/bin:/bin',
    )).toBe('/Users/example/.local/bin:/opt/homebrew/bin:/usr/bin:/bin')
  })

  it('passes the recovered PATH to provider subprocesses', async () => {
    const environmentPath = '/Users/example/.local/bin:/usr/bin:/bin'
    const resolved = { command: process.execPath, kind: 'direct' as const, environmentPath }

    expect(commandEnvironment(resolved)).toMatchObject({ PATH: environmentPath })
    await expect(runCommand(resolved, ['-e', 'process.stdout.write(process.env.PATH ?? "")']))
      .resolves.toMatchObject({ code: 0, stdout: environmentPath })
  })
})

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
