import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Design } from './contracts.js'
import { createOfflineZip } from './exportService.js'

describe('offline export', () => {
  it('contains only the selected ready-to-open runtime artifact', () => {
    const design: Design = {
      id: 'design', projectId: 'project', projectName: 'Project', title: 'Design', draft: '',
      createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z',
      activeRevisionId: 'second', selectedRevisionId: 'first', messages: [],
      revisions: [
        { id: 'first', parentRevisionId: null, prompt: 'First', providerId: 'mock', modelId: 'mock-v1', createdAt: '2026-07-20T10:00:00.000Z', html: '<html><body>First</body></html>' },
        { id: 'second', parentRevisionId: 'first', prompt: 'Second', providerId: 'mock', modelId: 'mock-v1', createdAt: '2026-07-20T10:01:00.000Z', html: '<html><body>Second</body></html>' },
      ],
    }

    const files = unzipSync(createOfflineZip(design, 'first'))
    expect(Object.keys(files)).toEqual(['index.html'])
    expect(strFromU8(files['index.html'])).toBe('<html><body>First</body></html>')
  })
})
