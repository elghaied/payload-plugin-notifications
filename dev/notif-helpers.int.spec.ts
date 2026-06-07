import { afterEach, describe, expect, test, vi } from 'vitest'

import { markNotificationRead } from '../src/utilities/markNotificationRead.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('markNotificationRead', () => {
  test('PATCHes /api/{slug}/{id} with read:true and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await markNotificationRead('/api', 'notifications', 'abc123')
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/abc123', {
      body: JSON.stringify({ read: true }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    })
  })
})
