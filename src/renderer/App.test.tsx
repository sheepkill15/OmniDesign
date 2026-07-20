import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('discovers installed providers and sends a prompt to the selected model', async () => {
    const prompt = vi.fn().mockResolvedValue({ providerId: 'claude', modelId: 'claude-sonnet-4-6', text: 'Hello from Claude.' })
    Object.defineProperty(window, 'omnidesign', { value: { providers: { discover: vi.fn().mockResolvedValue([{ id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Signed in.', models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }] }]), prompt } }, configurable: true })
    render(<App />)

    expect(await screen.findByRole('radio', { name: 'Claude Sonnet 4.6' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Say hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(prompt).toHaveBeenCalledWith({ providerId: 'claude', modelId: 'claude-sonnet-4-6', prompt: 'Say hello' })
    expect(await screen.findByText('Hello from Claude.')).toBeInTheDocument()
  })
})
