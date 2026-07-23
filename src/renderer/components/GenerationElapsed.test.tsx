import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationElapsed, formatGenerationElapsed } from './GenerationElapsed'

afterEach(() => vi.useRealTimers())

describe('GenerationElapsed', () => {
  it('formats seconds and minutes', () => {
    expect(formatGenerationElapsed('2026-07-22T10:00:00.000Z', Date.parse('2026-07-22T10:00:09.000Z'))).toBe('9s')
    expect(formatGenerationElapsed('2026-07-22T10:00:00.000Z', Date.parse('2026-07-22T10:01:04.000Z'))).toBe('1m 4s')
  })

  it('updates while generation work remains visible', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-22T10:00:09.000Z')
    render(<GenerationElapsed startedAt="2026-07-22T10:00:00.000Z" />)

    expect(screen.getByRole('time', { name: 'Elapsed time' })).toHaveTextContent('9s')
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByRole('time', { name: 'Elapsed time' })).toHaveTextContent('11s')
  })
})
