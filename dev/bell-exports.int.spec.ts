import { describe, expect, test } from 'vitest'

import * as client from '../src/exports/client.js'

describe('client exports', () => {
  test('NotificationBell is exported', () => {
    expect(client.NotificationBell).toBeDefined()
  })

  test('NotificationsListView is exported', () => {
    expect(client.NotificationsListView).toBeDefined()
  })
  test('NotificationCell is no longer exported', () => {
    expect((client as Record<string, unknown>).NotificationCell).toBeUndefined()
  })
})
