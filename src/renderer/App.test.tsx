import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(cleanup)

describe('App', () => {
  it('discovers installed providers and sends a prompt to the selected model', async () => {
    let activityListener: ((activity: ProviderActivity) => void) | undefined
    const prompt = vi.fn().mockResolvedValue({ providerId: 'claude', modelId: 'claude-sonnet-4-6', text: 'Hello from Claude.' })
    const onActivity = vi.fn((listener: (activity: ProviderActivity) => void) => { activityListener = listener; return vi.fn() })
    Object.defineProperty(window, 'omnidesign', { value: { providers: { discover: vi.fn().mockResolvedValue([
      { id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Signed in.', models: [{ id: 'gpt-5', name: 'GPT-5', effortLevels: [] }] },
      { id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Signed in.', models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', effortLevels: [{ id: 'high', name: 'High', isDefault: false }] }] },
    ]), prompt, onActivity } }, configurable: true })
    render(<App />)

    expect(await screen.findByRole('button', { name: /Codex.*Adapter ready/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Claude.*Adapter ready/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Unified provider contract' })).toHaveTextContent('Stream shared events')
    fireEvent.click(screen.getByRole('button', { name: /Claude.*Adapter ready/ }))
    expect(await screen.findByRole('radio', { name: 'Claude Sonnet 4.6' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'High' }))
    fireEvent.change(screen.getByLabelText('Unified prompt'), { target: { value: 'Say hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send through unified interface' }))
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), providerId: 'claude', modelId: 'claude-sonnet-4-6', effort: 'high', prompt: 'Say hello' }))
    expect(await screen.findByText('Hello from Claude.')).toBeInTheDocument()
    activityListener?.({ requestId: 'request-1', providerId: 'claude', kind: 'tool', label: 'Agent action', detail: 'Read: {"path":"README.md"}' })
    expect(await screen.findByText('Agent action')).toBeInTheDocument()
    expect(screen.queryByText('Raw provider event')).not.toBeInTheDocument()
  })

  it('keeps the unified contract demonstration visible without the Electron bridge', async () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })

    render(<App />)

    expect(screen.getByRole('region', { name: 'Unified provider contract' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Live provider discovery is available in the Electron test application.',
    )
  })
})
