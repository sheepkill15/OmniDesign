import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
})

describe('Phase 1 home concepts', () => {
  it('shows the quiet studio concept by default with the required home actions', () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Good afternoon, Simon.' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Create a design' })).toBeInTheDocument()
    expect(screen.getAllByText('Set up provider').length).toBeGreaterThan(0)
    expect(screen.getByText('Analytics overview')).toBeInTheDocument()
  })

  it('switches between all three review concepts', () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'B · Visual gallery' }))
    expect(screen.getByRole('heading', { name: 'Make the next version visible.' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'C · Project workbench' }))
    expect(screen.getByRole('heading', { name: 'What are we building?' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Workspace activity' })).toBeInTheDocument()
  })

  it('discovers an installed provider and toggles the review theme', async () => {
    Object.defineProperty(window, 'omnidesign', { value: { providers: {
      discover: vi.fn().mockResolvedValue([{ id: 'codex', name: 'Codex', installed: true, authenticated: true, detail: 'Ready', models: [] }]),
      prompt: vi.fn(),
      onActivity: vi.fn(),
    } }, configurable: true })
    render(<App />)

    await waitFor(() => expect(screen.getByText('Codex')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('enables the submit control only after the user enters a prompt', () => {
    Object.defineProperty(window, 'omnidesign', { value: undefined, configurable: true })
    render(<App />)

    const submit = screen.getByRole('button', { name: 'Create design' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'What would you like to design?' }), { target: { value: 'A calm dashboard' } })
    expect(submit).toBeEnabled()
  })
})
