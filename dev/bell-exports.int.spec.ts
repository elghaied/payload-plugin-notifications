import { describe, expect, test } from 'vitest'

import * as client from '../src/exports/client.js'

describe('client exports', () => {
  test('NotificationBell is exported', () => {
    expect(client.NotificationBell).toBeDefined()
  })

  test('NotificationCell is exported', () => {
    expect(client.NotificationCell).toBeDefined()
  })
})
