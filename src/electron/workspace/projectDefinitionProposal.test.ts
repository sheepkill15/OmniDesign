import { describe, expect, it } from 'vitest'
import { createProjectDefinitionProposalPrompt, parseProjectDefinitionProposal, selectProjectDefinitionAnalysisRoots } from './projectDefinitionProposal.js'

describe('project definition proposals', () => {
  it('parses a fenced provider proposal through the runtime schema', () => {
    const definitions = parseProjectDefinitionProposal('```json\n{"schemaVersion":1,"colors":[{"name":"primary","value":"#123456","description":null}],"typography":[],"spacing":[],"shape":[],"visualGuidance":"Calm.","aiAgentInstructions":"Reuse tokens."}\n```')
    expect(definitions.colors[0]).toEqual({ name: 'primary', value: '#123456', description: null })
    expect(definitions.aiAgentInstructions).toBe('Reuse tokens.')
  })

  it('rejects malformed or invalid semantic proposals', () => {
    expect(() => parseProjectDefinitionProposal('No JSON here')).toThrow(/did not return/)
    expect(() => parseProjectDefinitionProposal('{"schemaVersion":1,"colors":[{"name":"Primary Color","value":"red"}]}')).toThrow()
  })

  it('tells a writable provider harness to inspect without changing the original repositories', () => {
    expect(createProjectDefinitionProposalPrompt('Aurora')).toContain('current provider harness has read-write access')
    expect(createProjectDefinitionProposalPrompt('Aurora')).toContain('do not modify any files')
  })

  it('passes original project and design repositories directly without making an analysis copy', () => {
    expect(selectProjectDefinitionAnalysisRoots('C:\\projects\\aurora', true, ['C:\\designs\\one', 'C:\\designs\\two'])).toEqual({
      workspacePath: 'C:\\projects\\aurora',
      referencePaths: ['C:\\designs\\one', 'C:\\designs\\two'],
    })
    expect(selectProjectDefinitionAnalysisRoots(null, true, ['C:\\designs\\one'])).toEqual({
      workspacePath: 'C:\\designs\\one',
      referencePaths: [],
    })
    expect(selectProjectDefinitionAnalysisRoots('C:\\missing', false, [])).toBeNull()
  })
})
