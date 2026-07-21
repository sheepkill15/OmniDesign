import { describe, expect, it } from 'vitest'
import { createDesignAgentInstructions, parseAgentCompletionPayload } from './agentHarness.js'

describe('agent completion payload', () => {
  it('accepts only the conversational response field', () => {
    expect(parseAgentCompletionPayload('{"response":"I updated the design."}')).toEqual({ response: 'I updated the design.' })
    expect(() => parseAgentCompletionPayload('{"response":"Done","changedFiles":["index.html"]}')).toThrow('required JSON completion payload')
  })

  it('directs the agent to work in the prepared repository without self-reporting Git evidence', () => {
    const instructions = createDesignAgentInstructions('C:\\workspace\\design')
    expect(instructions).toContain('C:\\workspace\\design')
    expect(instructions).toContain('Do not claim which files changed')
    expect(() => createDesignAgentInstructions('relative/design')).toThrow('must be absolute')
  })
})
