export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function titleCase(value: string): string {
  return value.replace(
    /(^|[-_])([a-z])/g,
    (_, separator: string, letter: string) => `${separator === '-' ? ' ' : separator}${letter.toUpperCase()}`,
  )
}

export function providerFailure(provider: string, stdout: string, stderr: string): Error {
  const detail = stderr.trim() || stdout.trim()
  if (!detail) return new Error(`${provider} exited without diagnostic output.`)
  try {
    const payload: unknown = JSON.parse(detail)
    if (isObject(payload) && typeof payload.result === 'string') return new Error(payload.result)
  } catch {
    // Preserve ordinary CLI diagnostics verbatim.
  }
  return new Error(detail)
}

export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function formatTokenCount(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} token${Math.round(value) === 1 ? '' : 's'}`
}

// Map a provider tool name to a short, non-technical phrase for the conversation activity log. The
// intent (writing, reading, exploring) is what a non-technical user cares about — not the tool name,
// file path, or command text.
export function friendlyToolAction(toolName: string): string {
  switch (toolName.toLowerCase()) {
    case 'write':
      return 'Writing the design'
    case 'edit':
    case 'multiedit':
    case 'notebookedit':
    case 'applypatch':
    case 'apply_patch':
      return 'Editing the design'
    case 'read':
      return 'Reading files'
    case 'bash':
    case 'shell':
    case 'command':
      return 'Running a command'
    case 'glob':
    case 'grep':
    case 'ls':
    case 'list':
      return 'Exploring the project'
    case 'webfetch':
    case 'websearch':
      return 'Looking something up'
    case 'todowrite':
    case 'task':
      return 'Planning the steps'
    default:
      return 'Working on the design'
  }
}
