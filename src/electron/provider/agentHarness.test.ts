import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildConversationRecap, createDesignAgentInstructions, createFocusedEditPrompt, createFocusedFeedbackBatchPrompt, normalizeAgentReply } from './agentHarness.js'

const workspacePath = path.resolve('test-workspace', 'design')
const projectPath = path.resolve('test-projects', 'aurora')

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
    expect(createDesignAgentInstructions(workspacePath, [], null, 'User: Build a dashboard')).toContain('conversation so far')
    expect(createDesignAgentInstructions(workspacePath, [], null, 'User: Build a dashboard')).toContain('User: Build a dashboard')
    expect(createDesignAgentInstructions(workspacePath)).not.toContain('conversation so far')
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
    const instructions = createDesignAgentInstructions(workspacePath)
    expect(instructions).toContain(workspacePath)
    expect(instructions).toContain('Do not claim which files changed')
    expect(instructions).toContain('x-collapse')
    expect(instructions).toContain('requires exactly one root element inside the <template>')
    expect(instructions).toContain('Multiple sibling roots do not work')
    expect(() => createDesignAgentInstructions('relative/design')).toThrow('must be absolute')
  })

  it('tells the agent it may author multiple linked pages discovered from Git', () => {
    const instructions = createDesignAgentInstructions(workspacePath)
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
    const instructions = createDesignAgentInstructions(workspacePath)
    expect(instructions).toContain('who may not be technical')
    expect(instructions).toContain('Do NOT mention code, file names')
    expect(instructions).toContain('There is no required format')
    expect(instructions).not.toContain('JSON object matching the required schema')
  })

  it('directs the agent to inspect a linked project before implementing the design', () => {
    const instructions = createDesignAgentInstructions(workspacePath, [], projectPath)

    expect(instructions).toContain(projectPath)
    expect(instructions).toContain('Inspect its relevant source, styles, assets, and configuration')
  })
})

describe('focused edit prompt', () => {
  it('keeps the user wording and adds exact trusted source context plus supporting-file permission', () => {
    const result = createFocusedEditPrompt('Make this call to action calmer.', {
      designId: 'design-1',
      revisionId: 'revision-1',
      path: 'pages/pricing.html',
      startLine: 24,
      endLine: 31,
      label: '<button#buy.primary>',
      stableId: 'pricing-cta',
      excerpt: '<button data-od-id="pricing-cta">Buy now</button>',
      dynamicDescription: null,
    })

    expect(result).toContain('Make this call to action calmer.')
    expect(result).toContain('pages/pricing.html:24-31')
    expect(result).toContain('stable identifier: pricing-cta')
    expect(result).toContain('supporting CSS, JavaScript, shared components, or adjacent markup')
    expect(result).toContain('<button data-od-id="pricing-cta">Buy now</button>')
  })

  it('discloses nearest-authored-ancestor fallback', () => {
    const result = createFocusedEditPrompt('Change this item.', {
      designId: 'design-1', revisionId: 'revision-1', path: 'index.html', startLine: 5, endLine: 8,
      label: '<li>', stableId: null, excerpt: '<ul x-data="items"></ul>', dynamicDescription: '<span.runtime-item>',
    })

    expect(result).toContain('clicked runtime element was <span.runtime-item>')
    expect(result).toContain('nearest authored ancestor')
  })

  it('combines queued feedback into one coordinated edit with every exact target', () => {
    const result = createFocusedFeedbackBatchPrompt([
      {
        id: '8b7e3b7c-e81f-4b65-a0d1-907f14a9e885',
        comment: 'Make the heading feel more grounded.',
        target: {
          designId: 'design-1', revisionId: 'revision-1', path: 'index.html', startLine: 12, endLine: 16,
          label: '<h1.hero-title>', stableId: 'hero-title', excerpt: '<h1>Move with confidence</h1>', dynamicDescription: null,
        },
        createdAt: '2026-07-27T10:00:00.000Z',
      },
      {
        id: 'a91b71b4-8a42-4fb8-b93e-bf398c19329d',
        comment: 'Give this action more breathing room.',
        target: {
          designId: 'design-1', revisionId: 'revision-1', path: 'pages/pricing.html', startLine: 24, endLine: 31,
          label: '<button#buy.primary>', stableId: 'pricing-cta', excerpt: '<button>Buy now</button>', dynamicDescription: null,
        },
        createdAt: '2026-07-27T10:01:00.000Z',
      },
    ])

    expect(result).toContain('one coordinated update')
    expect(result).toContain('Make the heading feel more grounded.')
    expect(result).toContain('index.html:12-16')
    expect(result).toContain('Give this action more breathing room.')
    expect(result).toContain('pages/pricing.html:24-31')
    expect(result).toContain('supporting CSS, JavaScript, shared components, or adjacent markup')
  })
})
