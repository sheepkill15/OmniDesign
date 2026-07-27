import { describe, expect, it } from 'vitest'
import { focusedTargetSchema, queueFocusedFeedbackRequestSchema, resolveFocusedTargetRequestSchema, submitFocusedFeedbackBatchRequestSchema } from './contracts.js'

const target = {
  designId: 'design-1', revisionId: 'revision-1', path: 'pages/pricing.html',
  startLine: 24, endLine: 31, label: '<button>', stableId: null,
  excerpt: '<button>Buy now</button>', dynamicDescription: null,
}

describe('focused selection contracts', () => {
  it('accepts a bounded repository-relative target and rejects malformed or escaping locations', () => {
    expect(focusedTargetSchema.parse(target)).toEqual(target)
    expect(focusedTargetSchema.safeParse({ ...target, path: '../secret.html' }).success).toBe(false)
    expect(focusedTargetSchema.safeParse({ ...target, path: 'styles.css' }).success).toBe(false)
    expect(focusedTargetSchema.safeParse({ ...target, startLine: 40, endLine: 20 }).success).toBe(false)
    expect(focusedTargetSchema.safeParse({ ...target, excerpt: 'x'.repeat(4_101) }).success).toBe(false)
  })

  it('rejects forged identifiers and oversized generated-frame metadata before privileged resolution', () => {
    const request = {
      designId: 'design-1', revisionId: 'revision-1',
      token: '0106f7df-c357-4ad5-88f1-35075188d163', page: 'index.html',
      locationId: '6c81c254-bf06-4a04-8b3c-4c39779b2466', clickedLabel: '<button>', usedAncestor: false,
    }
    expect(resolveFocusedTargetRequestSchema.parse(request)).toEqual(request)
    expect(resolveFocusedTargetRequestSchema.safeParse({ ...request, token: 'forged' }).success).toBe(false)
    expect(resolveFocusedTargetRequestSchema.safeParse({ ...request, locationId: 'forged' }).success).toBe(false)
    expect(resolveFocusedTargetRequestSchema.safeParse({ ...request, clickedLabel: 'x'.repeat(201) }).success).toBe(false)
    expect(resolveFocusedTargetRequestSchema.safeParse({ ...request, page: '../../outside.html' }).success).toBe(false)
  })

  it('bounds queued comments and requires a unique, nonempty batch', () => {
    const queueRequest = { designId: 'design-1', comment: 'Make this calmer.', target }
    expect(queueFocusedFeedbackRequestSchema.parse(queueRequest)).toEqual(queueRequest)
    expect(queueFocusedFeedbackRequestSchema.safeParse({ ...queueRequest, comment: '  ' }).success).toBe(false)
    expect(queueFocusedFeedbackRequestSchema.safeParse({ ...queueRequest, comment: 'x'.repeat(100_001) }).success).toBe(false)

    const feedbackId = '8b7e3b7c-e81f-4b65-a0d1-907f14a9e885'
    const batch = { designId: 'design-1', feedbackIds: [feedbackId], providerId: 'mock', modelId: 'mock-v1' }
    expect(submitFocusedFeedbackBatchRequestSchema.parse(batch)).toEqual(batch)
    expect(submitFocusedFeedbackBatchRequestSchema.safeParse({ ...batch, feedbackIds: [] }).success).toBe(false)
    expect(submitFocusedFeedbackBatchRequestSchema.safeParse({ ...batch, feedbackIds: [feedbackId, feedbackId] }).success).toBe(false)
  })
})
