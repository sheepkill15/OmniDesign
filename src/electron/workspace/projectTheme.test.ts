import { describe, expect, it } from 'vitest'
import type { ProjectDesignDefinitionVersion } from './contracts.js'
import { createProjectDefinitionPromptContext, materializeProjectTheme, PROJECT_THEME_PATH } from './projectTheme.js'

const version: ProjectDesignDefinitionVersion = {
  id: '4ecde3a1-3d43-4db9-a8f4-6da2c8d8d5ab',
  projectId: 'project-1',
  version: 3,
  createdAt: '2026-07-27T10:00:00.000Z',
  definitions: {
    schemaVersion: 1,
    colors: [{ name: 'primary', value: '#123456', description: null }],
    typography: [{ name: 'body', fontFamily: 'Oak Sans, sans-serif', fontSize: '1rem', fontWeight: '400', lineHeight: '1.5', letterSpacing: '0.01em', description: null }],
    spacing: [{ name: 'section-gap', value: '4rem', description: null }],
    shape: [{ name: 'control-radius', value: '0.5rem', description: null }],
    visualGuidance: 'Quiet and editorial.',
    aiAgentInstructions: 'Keep actions compact.',
  },
}

describe('project theme materialization', () => {
  it('writes semantic CSS variables and links every page with the correct relative path', () => {
    const files = materializeProjectTheme({
      'index.html': '<html><head><link rel="stylesheet" href=".build/tailwind.css"></head><body></body></html>',
      'pages/about.html': '<html><head><link rel="stylesheet" href="../.build/tailwind.css"></head><body></body></html>',
    }, version)

    expect(files[PROJECT_THEME_PATH]).toContain('--od-color-primary: #123456;')
    expect(files[PROJECT_THEME_PATH]).toContain('--od-font-body-family: Oak Sans, sans-serif;')
    expect(files['index.html']).toContain('href="./omnidesign.theme.css" data-omnidesign-theme="3"')
    expect(files['pages/about.html']).toContain('href="../omnidesign.theme.css" data-omnidesign-theme="3"')
  })

  it('includes visual guidance and AI Agent instructions in the first prompt context', () => {
    const context = createProjectDefinitionPromptContext(version)
    expect(context).toContain('AI Agent instructions:\nKeep actions compact.')
    expect(context).toContain('Visual guidance:\nQuiet and editorial.')
    expect(context).toContain('"name": "primary"')
  })
})
