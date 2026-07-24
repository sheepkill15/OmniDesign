import { describe, expect, it } from 'vitest'
import { buildConversationRecap, createDesignAgentInstructions, normalizeAgentReply } from './agentHarness.js'

describe('conversation recap', () => {
  it('recaps recent user and assistant turns and skips system notices and blanks', () => {
    const recap = buildConversationRecap([
      { role: 'user', text: 'Build a dashboard' },
      { role: 'assistant', text: 'Built it.' },
      { role: 'system', text: 'Something happened' },
      { role: 'user', text: '  ' },
      { role: 'user', text: 'Make it darker' },
    ])
    expect(recap).toBe('User: Build a dashboard\nOmniDesign: Built it.\nUser: Make it darker')
  })

  it('is empty when there is nothing worth recapping', () => {
    expect(buildConversationRecap([])).toBe('')
    expect(buildConversationRecap([{ role: 'system', text: 'notice' }])).toBe('')
  })

  it('injects the recap into the agent instructions only when provided', () => {
    expect(createDesignAgentInstructions('C:\\workspace\\design', [], null, 'User: Build a dashboard')).toContain('conversation so far')
    expect(createDesignAgentInstructions('C:\\workspace\\design', [], null, 'User: Build a dashboard')).toContain('User: Build a dashboard')
    expect(createDesignAgentInstructions('C:\\workspace\\design')).not.toContain('conversation so far')
  })
})

describe('agent reply', () => {
  it('treats whatever the agent returns as Markdown, only trimming and capping length', () => {
    // No output shape is imposed: plain prose and Markdown pass through verbatim (just trimmed).
    expect(normalizeAgentReply('  Your landing page is ready.  ')).toBe('Your landing page is ready.')
    expect(normalizeAgentReply('## Done\n\nThe **hero** now spans the full width.')).toBe('## Done\n\nThe **hero** now spans the full width.')
    // A runaway response is capped so it cannot balloon the store.
    expect(normalizeAgentReply('a'.repeat(200_000))).toHaveLength(100_000)
  })

  it('directs the agent to work in the prepared repository without self-reporting Git evidence', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design')
    expect(instructions).toContain('C:\\workspace\\design')
    expect(instructions).toContain('Do not claim which files changed')
    expect(instructions).toContain('x-collapse')
    expect(() => createDesignAgentInstructions('relative/design')).toThrow('must be absolute')
  })

  it('tells the agent it may author multiple linked pages discovered from Git', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design')
    // Multi-page contract: pages are discovered, not declared; index.html is home; relative links.
    expect(instructions).toContain('Every *.html file you commit outside the .build/ folder is a page')
    expect(instructions).toContain('index.html is the home page when it exists')
    expect(instructions).toContain('<a href="about.html">')
    expect(instructions).toContain('never declare a file list or choose an entry point')
    // One shared stylesheet across every page, still owned by OmniDesign.
    expect(instructions).toContain('one shared compiled Tailwind stylesheet (.build/tailwind.css) covering every page')
    // Sibling files now ship in preview and export (reversal of the Phase 1 single-file contract).
    expect(instructions).toContain('All committed files are included in both the preview and the exported design')
    expect(instructions).toContain('Every page must be a complete HTML document')
  })

  it('tells the agent to write for a non-technical audience and imposes no reply format', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design')
    expect(instructions).toContain('who may not be technical')
    expect(instructions).toContain('Do NOT mention code, file names')
    expect(instructions).toContain('There is no required format')
    expect(instructions).not.toContain('JSON object matching the required schema')
  })

  it('directs the agent to inspect a linked project before implementing the design', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design', [], 'C:\\projects\\aurora')

    expect(instructions).toContain('C:\\projects\\aurora')
    expect(instructions).toContain('Inspect its relevant source, styles, assets, and configuration')
  })
})
