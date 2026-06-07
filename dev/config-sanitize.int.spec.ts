import { describe, expect, test } from 'vitest'

import { sanitizeConfig } from '../src/types.js'

describe('sanitizeConfig', () => {
  test('applies defaults when given an empty object', () => {
    const c = sanitizeConfig({})
    expect(c.notificationsSlug).toBe('notifications')
    expect(c.usersSlug).toBe('users')
    expect(c.hideFromNav).toBe(false)
    expect(c.tenants).toBeNull()
  })

  test('normalizes a tenants block with its own defaults', () => {
    const c = sanitizeConfig({ tenants: {} })
    expect(c.tenants).toEqual({ tenantFieldName: 'tenant', tenantsSlug: 'tenants' })
  })

  test('respects explicit overrides', () => {
    const c = sanitizeConfig({
      hideFromNav: false,
      notificationsSlug: 'notes',
      tenants: { tenantFieldName: 'org', tenantsSlug: 'orgs' },
      usersSlug: 'admins',
    })
    expect(c.notificationsSlug).toBe('notes')
    expect(c.usersSlug).toBe('admins')
    expect(c.hideFromNav).toBe(false)
    expect(c.tenants).toEqual({ tenantFieldName: 'org', tenantsSlug: 'orgs' })
  })
})
