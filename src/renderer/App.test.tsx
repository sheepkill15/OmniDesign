import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('discovers installed providers and sends a prompt to the selected model', async () => {
    let activityListener: ((activity: ProviderActivity) => void) | undefined
    const prompt = vi.fn().mockResolvedValue({ providerId: 'claude', modelId: 'claude-sonnet-4-6', text: 'Hello from Claude.' })
    const onActivity = vi.fn((listener: (activity: ProviderActivity) => void) => { activityListener = listener; return vi.fn() })
    Object.defineProperty(window, 'omnidesign', { value: { providers: { discover: vi.fn().mockResolvedValue([{ id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Signed in.', models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', effortLevels: [{ id: 'high', name: 'High', isDefault: false }] }] }]), prompt, onActivity } }, configurable: true })
    render(<App />)

    expect(await screen.findByRole('radio', { name: 'Claude Sonnet 4.6' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'High' }))
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Say hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), providerId: 'claude', modelId: 'claude-sonnet-4-6', effort: 'high', prompt: 'Say hello' }))
    expect(await screen.findByText('Hello from Claude.')).toBeInTheDocument()
    activityListener?.({ requestId: 'request-1', providerId: 'claude', kind: 'tool', label: 'Claude Read', detail: '{"path":"README.md"}', raw: { type: 'tool_use' } })
    expect(await screen.findByText('Claude Read')).toBeInTheDocument()
  })
})
