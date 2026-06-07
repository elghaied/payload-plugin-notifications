import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { pushNotification } from '../src/pushNotification.js'

let payload: Payload
let userId: string

beforeAll(async () => {
  payload = await getPayload({ config })
  const user = await payload.create({
    collection: 'users',
    data: { email: `recip-${Date.now()}@test.com`, password: 'test1234' },
  })
  userId = String(user.id)
})

afterAll(async () => {
  await payload.destroy()
})

describe('pushNotification', () => {
  test('creates a notification row for the recipient', async () => {
    const doc = await pushNotification(payload, {
      type: 'success',
      link: '/admin/collections/invoices/1',
      message: 'Invoice paid',
      recipient: userId,
    })
    expect(doc.id).toBeDefined()
    expect(doc.message).toBe('Invoice paid')
    expect(doc.type).toBe('success')
    expect(doc.read).toBe(false)

    const found = await payload.findByID({ id: doc.id, collection: 'notifications' })
    const recipientId =
      found.recipient && typeof found.recipient === 'object' && 'id' in found.recipient
        ? String((found.recipient as { id: unknown }).id)
        : String(found.recipient)
    expect(recipientId).toBe(userId)
  })

  test('defaults type to info', async () => {
    const doc = await pushNotification(payload, { message: 'plain', recipient: userId })
    expect(doc.type).toBe('info')
  })
})
