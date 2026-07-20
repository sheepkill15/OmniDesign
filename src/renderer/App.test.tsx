import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(cleanup)

describe('Phase 1 home', () => {
  it('renders the accepted home composition and required actions', () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Good afternoon, Simon.' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Create a design' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Continue designing' })).toBeInTheDocument()
    expect(screen.getByText('Analytics overview')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Home page concept' })).not.toBeInTheDocument()
  })

  it('discovers an installed provider through the existing bridge', async () => {
    Object.defineProperty(window, 'omnidesign', { value: { providers: {
      discover: vi.fn().mockResolvedValue([{ id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] }]),
      prompt: vi.fn(),
      onActivity: vi.fn(),
    } }, configurable: true })
    render(<App />)

    await waitFor(() => expect(screen.getByText('Codex')).toBeInTheDocument())
  })

  it('enables submission after prompt entry and supports Enter to submit', () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })
    render(<App />)

    const prompt = screen.getByRole('textbox', { name: 'What would you like to design?' })
    const submit = screen.getByRole('button', { name: 'Create design' })
    expect(submit).toBeDisabled()

    fireEvent.change(prompt, { target: { value: 'A calm dashboard' } })
    expect(submit).toBeEnabled()
    fireEvent.keyDown(prompt, { key: 'Enter' })
    expect(prompt).toHaveValue('')
    expect(submit).toBeDisabled()
  })
})
