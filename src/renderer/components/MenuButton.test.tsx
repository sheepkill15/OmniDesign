import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { MenuButton } from './MenuButton'

afterEach(cleanup)

describe('MenuButton', () => {
  it('labels the trigger and reveals its popover content on press', () => {
    render(<MenuButton label="Open panel" trigger={<span>Trigger</span>}><div>Panel body</div></MenuButton>)

    expect(screen.queryByText('Panel body')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }))
    expect(screen.getByText('Panel body')).toBeInTheDocument()
  })

  it('reflects a controlled open state', () => {
    const { rerender } = render(<MenuButton label="Controlled" trigger="t" isOpen={false} onOpenChange={() => undefined}><div>Body</div></MenuButton>)
    expect(screen.queryByText('Body')).not.toBeInTheDocument()

    rerender(<MenuButton label="Controlled" trigger="t" isOpen onOpenChange={() => undefined}><div>Body</div></MenuButton>)
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
})
