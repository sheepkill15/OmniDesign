import { describe, expect, it } from 'vitest'
import type { ProjectDesignDefinitionVersion } from './contracts.js'
import { canUpdateProjectThemeDeterministically, createProjectDefinitionPromptContext, materializeProjectTheme, PROJECT_THEME_PATH } from './projectTheme.js'

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

  it('updates an existing managed link and distinguishes token-only changes from interpretive changes', () => {
    const updatedVersion = { ...version, version: 4, definitions: { ...version.definitions, colors: [{ name: 'primary', value: '#654321', description: null }] } }
    const first = materializeProjectTheme({ 'index.html': '<html><head></head><body></body></html>' }, version)
    const second = materializeProjectTheme(first, updatedVersion)
    expect(second['index.html']?.match(/data-omnidesign-theme/g)).toHaveLength(1)
    expect(second['index.html']).toContain('data-omnidesign-theme="4"')
    expect(canUpdateProjectThemeDeterministically(version.definitions, updatedVersion.definitions)).toBe(true)
    expect(canUpdateProjectThemeDeterministically(version.definitions, { ...updatedVersion.definitions, visualGuidance: 'A new composition.' })).toBe(false)
    expect(canUpdateProjectThemeDeterministically(version.definitions, { ...updatedVersion.definitions, colors: [] })).toBe(false)
  })
})
