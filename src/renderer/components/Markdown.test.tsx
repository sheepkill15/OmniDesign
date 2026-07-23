import { render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

function renderMarkdown(text: string) {
  return render(<Markdown text={text} />).container
}

describe('Markdown', () => {
  it('renders common inline and block markdown', () => {
    const container = renderMarkdown('# Title\n\nSome **bold** and *italic* and `code`.\n\n- one\n- two\n\n```\nconst x = 1\n```')
    expect(container.querySelector('.md-heading')?.textContent).toBe('Title')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelector('code.md-code')?.textContent).toBe('code')
    expect(container.querySelectorAll('.md-list li')).toHaveLength(2)
    expect(container.querySelector('pre.md-pre code')?.textContent).toBe('const x = 1')
  })

  it('renders links as non-navigable text with the url on hover', () => {
    const container = renderMarkdown('See [the docs](https://example.com/guide).')
    const link = container.querySelector('.md-link')
    expect(link?.textContent).toBe('the docs')
    expect(link?.getAttribute('href')).toBeNull()
    expect(link?.getAttribute('title')).toBe('https://example.com/guide')
  })

  it('never emits raw HTML from untrusted model output', () => {
    const container = renderMarkdown('Hello <img src=x onerror="alert(1)"> <script>alert(2)</script>')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    // The angle-bracket content is rendered as literal, escaped text.
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
  })
})
