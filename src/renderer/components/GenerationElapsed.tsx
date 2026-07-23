import { useEffect, useState } from 'react'

export function formatGenerationElapsed(startedAt: string, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000))
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
}

export function GenerationElapsed({ startedAt }: { readonly startedAt: string }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  return <time aria-label="Elapsed time" className="generation-elapsed" dateTime={startedAt}>{formatGenerationElapsed(startedAt, now)}</time>
}
