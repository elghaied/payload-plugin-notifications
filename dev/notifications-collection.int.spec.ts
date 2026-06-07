import type { Access } from 'payload'

import { describe, expect, test } from 'vitest'

import { createNotificationsCollection } from '../src/collections/notifications.js'
import { sanitizeConfig } from '../src/types.js'

const fieldNames = (c: ReturnType<typeof createNotificationsCollection>) =>
  c.fields.map((f) => ('name' in f ? f.name : undefined)).filter(Boolean)

describe('createNotificationsCollection', () => {
  test('single-tenant: core fields present, no tenant field, hidden from nav', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    expect(c.slug).toBe('notifications')
    expect(fieldNames(c)).toEqual(['recipient', 'message', 'link', 'type', 'read'])
    expect(c.admin?.hidden).toBe(true)
    expect(c.admin?.useAsTitle).toBe('message')
  })

  test('multi-tenant: adds a required tenant relationship field', () => {
    const c = createNotificationsCollection(sanitizeConfig({ tenants: {} }))
    const tenant = c.fields.find((f) => 'name' in f && f.name === 'tenant') as any
    expect(tenant).toBeDefined()
    expect(tenant.type).toBe('relationship')
    expect(tenant.relationTo).toBe('tenants')
    expect(tenant.required).toBe(true)
  })

  test('read access denies anonymous and scopes to recipient', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    const read = c.access!.read as Access
    expect(read({ req: { user: null } } as any)).toBe(false)
    expect(read({ req: { user: { id: 'u1' } } } as any)).toEqual({ recipient: { equals: 'u1' } })
  })

  test('read access ANDs a tenant filter in multi-tenant mode', () => {
    const c = createNotificationsCollection(sanitizeConfig({ tenants: {} }))
    const read = c.access!.read as Access
    const result = read({ req: { user: { id: 'u1', tenant: 't1' } } } as any)
    expect(result).toEqual({
      and: [{ recipient: { equals: 'u1' } }, { tenant: { equals: 't1' } }],
    })
  })

  test('create is denied via REST; update/delete scope to recipient', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    expect((c.access!.create as Access)({ req: { user: { id: 'u1' } } } as any)).toBe(false)
    expect((c.access!.update as Access)({ req: { user: { id: 'u1' } } } as any)).toEqual({
      recipient: { equals: 'u1' },
    })
    expect((c.access!.delete as Access)({ req: { user: null } } as any)).toBe(false)
  })
})
