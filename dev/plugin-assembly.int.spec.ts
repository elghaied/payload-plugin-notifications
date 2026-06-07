import type { Config } from 'payload'

import { describe, expect, test } from 'vitest'

import { payloadPluginNotifications } from '../src/index.js'

const base = (): Config => ({ admin: {}, collections: [] }) as unknown as Config

describe('payloadPluginNotifications', () => {
  test('adds the notifications collection (with /stream endpoint + fan-out hook)', () => {
    const out = payloadPluginNotifications({})(base())
    const col = out.collections!.find((c) => c.slug === 'notifications')!
    expect(col).toBeDefined()
    expect(col.endpoints).toEqual([expect.objectContaining({ method: 'get', path: '/stream' })])
    expect(col.hooks?.afterChange?.length).toBe(1)
  })

  test('injects the bell into admin.components.actions', () => {
    const out = payloadPluginNotifications({})(base())
    expect(out.admin!.components!.actions).toContain(
      '@elghaied/payload-plugin-notifications/client#NotificationBell',
    )
  })

  test('disabled: keeps the collection (schema-stable) but adds no endpoint/hook/bell', () => {
    const out = payloadPluginNotifications({ disabled: true })(base())
    const col = out.collections!.find((c) => c.slug === 'notifications')!
    expect(col).toBeDefined()
    expect(col.endpoints ?? []).toHaveLength(0)
    expect(col.hooks?.afterChange ?? []).toHaveLength(0)
    expect(out.admin?.components?.actions ?? []).toHaveLength(0)
  })

  test('preserves existing collections and actions', () => {
    const incoming = {
      admin: { components: { actions: ['existing#Action'] } },
      collections: [{ slug: 'posts', fields: [] }],
    } as unknown as Config
    const out = payloadPluginNotifications({})(incoming)
    expect(out.collections!.find((c) => c.slug === 'posts')).toBeDefined()
    expect(out.admin!.components!.actions).toContain('existing#Action')
  })
})
