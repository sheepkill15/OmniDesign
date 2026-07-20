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
