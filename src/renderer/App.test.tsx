import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the OmniDesign placeholder', () => {
    render(<App />)

    expect(screen.getByText('OmniDesign is running.')).toBeInTheDocument()
  })
})
