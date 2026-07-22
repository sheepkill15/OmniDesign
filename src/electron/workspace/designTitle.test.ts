import { describe, expect, it } from 'vitest'
import { createDesignTitlePrompt, fallbackDesignTitle, normalizeDesignTitle, selectLightweightMetadataSelection } from './designTitle.js'

describe('design titles', () => {
  it('asks the provider for only a compact title using prompt and attachment names', () => {
    const prompt = createDesignTitlePrompt('Create an editorial recipe browser', [{
      id: '123e4567-e89b-42d3-a456-426614174000', name: 'recipes.pdf', path: 'C:\\references\\recipes.pdf', kind: 'file', size: 42,
      modifiedAt: null, selectedAt: '2026-07-22T12:00:00.000Z', status: 'available',
    }])

    expect(prompt).toContain('Return only a concise 2-6 word title')
    expect(prompt).toContain('Request: Create an editorial recipe browser')
    expect(prompt).toContain('References: file:recipes.pdf')
  })

  it('normalizes a provider response and retains a stable fallback', () => {
    expect(normalizeDesignTitle('"Recipe Atlas"\n', 'Fallback')).toBe('Recipe Atlas')
    expect(normalizeDesignTitle('  ', 'Fallback')).toBe('Fallback')
    expect(fallbackDesignTitle('Build a calm analytics dashboard!')).toBe('Build a calm analytics dashboard')
  })

  it('uses the lightest advertised model and effort for metadata', () => {
    const selection = selectLightweightMetadataSelection([{
      id: 'claude', name: 'Claude', installed: true, authenticated: true, detail: 'Ready', models: [
        { id: 'sonnet', name: 'Sonnet', effortLevels: [{ id: 'high', name: 'High', isDefault: true }] },
        { id: 'haiku', name: 'Haiku', effortLevels: [{ id: 'high', name: 'High', isDefault: false }, { id: 'low', name: 'Low', isDefault: false }] },
      ],
    }], 'claude', { modelId: 'sonnet', effort: 'high' })

    expect(selection).toEqual({ modelId: 'haiku', effort: 'low' })
  })
})
