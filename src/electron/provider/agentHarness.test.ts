import { describe, expect, it } from 'vitest'
import { createDesignAgentInstructions, parseAgentCompletionPayload } from './agentHarness.js'

describe('agent completion payload', () => {
  it('extracts the conversational response even when the model adds extra keys or formatting', () => {
    expect(parseAgentCompletionPayload('{"response":"I updated the design."}')).toEqual({ response: 'I updated the design.' })
    // Extra keys are tolerated rather than rejected — only `response` is required.
    expect(parseAgentCompletionPayload('{"response":"Done","changedFiles":["index.html"]}')).toEqual({ response: 'Done' })
    // Markdown code fences and surrounding prose are stripped.
    expect(parseAgentCompletionPayload('Here you go:\n```json\n{"response":"Fenced reply"}\n```')).toEqual({ response: 'Fenced reply' })
    // As a last resort the raw text becomes the response so a valid revision is not discarded.
    expect(parseAgentCompletionPayload('Just a plain sentence.')).toEqual({ response: 'Just a plain sentence.' })
  })

  it('uses the final object when a buffered chunk holds several concatenated JSON objects', () => {
    // Earlier messages are pushed to the conversation live while streaming; the final parse only needs
    // the last object of whatever remains buffered.
    const concatenated = '{"response":"Starting on the layout."}{"response":"The cooking app is complete."}'
    expect(parseAgentCompletionPayload(concatenated)).toEqual({ response: 'The cooking app is complete.' })
    // Braces inside the response text must not split an object.
    expect(parseAgentCompletionPayload('{"response":"first"}{"response":"uses {braces} inside"}'))
      .toEqual({ response: 'uses {braces} inside' })
  })

  it('directs the agent to work in the prepared repository without self-reporting Git evidence', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design')
    expect(instructions).toContain('C:\\workspace\\design')
    expect(instructions).toContain('Do not claim which files changed')
    expect(instructions).toContain('exactly one <main> landmark and one <h1>')
    expect(() => createDesignAgentInstructions('relative/design')).toThrow('must be absolute')
  })

  it('directs the agent to inspect a linked project before implementing the design', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design', [], 'C:\\projects\\aurora')

    expect(instructions).toContain('C:\\projects\\aurora')
    expect(instructions).toContain('Inspect its relevant source, styles, assets, and configuration')
  })
})
