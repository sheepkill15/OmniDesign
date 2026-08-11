import { execFileSync, spawn } from 'node:child_process'

const editorCommands = ['code', 'cursor', 'windsurf'] as const

function resolveCommand(command: string, platform: NodeJS.Platform): string | null {
  try {
    const locator = platform === 'win32' ? 'where.exe' : 'which'
    const output = execFileSync(locator, [command], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    return output ?? null
  } catch {
    return null
  }
}

export function discoverCodeEditor(platform: NodeJS.Platform = process.platform): { readonly command: string; readonly name: string } | null {
  for (const command of editorCommands) {
    const resolved = resolveCommand(command, platform)
    if (resolved) return { command: resolved, name: command === 'code' ? 'Visual Studio Code' : command === 'cursor' ? 'Cursor' : 'Windsurf' }
  }
  return null
}

export function openCodeEditor(workspacePath: string, platform: NodeJS.Platform = process.platform): string {
  const editor = discoverCodeEditor(platform)
  if (!editor) throw new Error('No supported code editor was found. Install Visual Studio Code, Cursor, or Windsurf and make its command available on PATH, then try again.')
  const child = spawn(editor.command, ['--new-window', workspacePath], { detached: true, stdio: 'ignore', windowsHide: true, shell: false })
  child.unref()
  return editor.name
}
