import { describe, expect, it, vi } from 'vitest'

const childProcess = vi.hoisted(() => ({
  execFileSync: vi.fn((locator: string, args: string[]) => {
    if (locator === 'where.exe' && args[0] === 'cursor') return 'C:\\Tools\\cursor.exe\r\n'
    throw new Error('not found')
  }),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

vi.mock('node:child_process', () => ({ ...childProcess, default: childProcess }))

import { spawn } from 'node:child_process'
import { discoverCodeEditor, openCodeEditor } from './codeEditor.js'

describe('code editor discovery', () => {
  it('uses only an allow-listed discovered editor and passes the managed workspace as one argument', () => {
    expect(discoverCodeEditor('win32')).toEqual({ command: 'C:\\Tools\\cursor.exe', name: 'Cursor' })
    expect(openCodeEditor('C:\\Managed\\design', 'win32')).toBe('Cursor')
    expect(spawn).toHaveBeenCalledWith('C:\\Tools\\cursor.exe', ['--new-window', 'C:\\Managed\\design'], expect.objectContaining({ shell: false, windowsHide: true }))
  })
})
