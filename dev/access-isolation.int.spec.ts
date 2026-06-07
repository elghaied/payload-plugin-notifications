import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { pushNotification } from '../src/pushNotification.js'

let payload: Payload
let alice: any
let bob: any

beforeAll(async () => {
  payload = await getPayload({ config })
  alice = await payload.create({ collection: 'users', data: { email: `alice-${Date.now()}@t.com`, password: 'test1234' } })
  bob = await payload.create({ collection: 'users', data: { email: `bob-${Date.now()}@t.com`, password: 'test1234' } })
  await pushNotification(payload, { message: 'for alice', recipient: alice.id })
  await pushNotification(payload, { message: 'for bob', recipient: bob.id })
})

afterAll(async () => {
  await payload.destroy()
})

describe('recipient access isolation', () => {
  test('alice sees only her notification under enforced access', async () => {
    const { docs } = await payload.find({
      collection: 'notifications',
      overrideAccess: false,
      user: alice,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0].message).toBe('for alice')
  })

  test('REST create is denied even for an authenticated user', async () => {
    await expect(
      payload.create({
        collection: 'notifications',
        data: { message: 'forged', recipient: bob.id },
        overrideAccess: false,
        user: alice,
      }),
    ).rejects.toThrow()
  })

  test('a user can mark their own notification read', async () => {
    const { docs } = await payload.find({ collection: 'notifications', overrideAccess: false, user: bob })
    const updated = await payload.update({
      id: docs[0].id,
      collection: 'notifications',
      data: { read: true },
      overrideAccess: false,
      user: bob,
    })
    expect(updated.read).toBe(true)
  })
})
