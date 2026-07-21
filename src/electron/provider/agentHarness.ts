import path from 'node:path'
import { z } from 'zod'

export const agentCompletionPayloadSchema = z.object({
  response: z.string().trim().min(1).max(100_000),
}).strict()

export type AgentCompletionPayload = z.infer<typeof agentCompletionPayloadSchema>

export const agentCompletionOutputSchema = {
  type: 'object',
  properties: {
    response: { type: 'string', minLength: 1, maxLength: 100_000 },
  },
  required: ['response'],
  additionalProperties: false,
} as const

export function createDesignAgentInstructions(workspacePath: string): string {
  if (!path.isAbsolute(workspacePath)) throw new Error('The design workspace path must be absolute.')
  return [
    'You are OmniDesign’s design agent.',
    `Work directly in the prepared Git repository at ${workspacePath}.`,
    'Make ordinary project edits only when they help satisfy the user request. The prepared index.html is the fixed preview and export entry page.',
    'Do not claim which files changed or whether a revision was created; OmniDesign determines that from Git and validation.',
    'When you finish, respond only with a JSON object matching the required schema. Its response value is your concise conversational reply to the user.',
  ].join('\n')
}

export function parseAgentCompletionPayload(value: string): AgentCompletionPayload {
  try {
    return agentCompletionPayloadSchema.parse(JSON.parse(value))
  } catch {
    throw new Error('The agent did not return the required JSON completion payload.')
  }
}
