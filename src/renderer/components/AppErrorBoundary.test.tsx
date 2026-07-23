import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenView(): never {
  throw new Error('Renderer exploded')
}

afterEach(() => vi.restoreAllMocks())

it('keeps a recovery action and technical diagnostics available after a renderer failure', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const reload = vi.fn()
  render(<AppErrorBoundary onReload={reload}><BrokenView /></AppErrorBoundary>)

  expect(screen.getByRole('alert')).toHaveTextContent('Your local projects, designs, drafts, and history remain stored on this device.')
  expect(screen.getByText('Technical details').closest('details')).not.toHaveAttribute('open')
  expect(screen.getByText(/Renderer exploded/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload OmniDesign' }))
  expect(reload).toHaveBeenCalledOnce()
})
