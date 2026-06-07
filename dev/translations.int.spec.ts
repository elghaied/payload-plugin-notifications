import type { Config } from 'payload'

import { describe, expect, test } from 'vitest'

import { createNotificationsCollection } from '../src/collections/notifications.js'
import { payloadPluginNotifications } from '../src/index.js'
import { translations } from '../src/translations/index.js'
import { sanitizeConfig } from '../src/types.js'

const base = (): Config => ({ admin: {}, collections: [] }) as unknown as Config
const fakeT = (k: string) => `T(${k})`

describe('i18n', () => {
  test('plugin merges the notifications translations into config.i18n (en)', () => {
    const out = payloadPluginNotifications({})(base())
    const en = (out.i18n?.translations as any)?.en?.['plugin-notifications']
    expect(en?.recipient).toBe('Recipient')
    expect(en?.seeAll).toBe('See all notifications')
  })

  test('user translations win on conflict', () => {
    const incoming = {
      admin: {},
      collections: [],
      i18n: { translations: { en: { 'plugin-notifications': { recipient: 'Custom' } } } },
    } as unknown as Config
    const out = payloadPluginNotifications({})(incoming)
    expect((out.i18n?.translations as any).en['plugin-notifications'].recipient).toBe('Custom')
  })

  test('collection + field labels are translation functions that resolve keys', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    expect(typeof (c.labels as any).singular).toBe('function')
    expect((c.labels as any).plural({ t: fakeT })).toBe('T(plugin-notifications:plural)')

    const message = c.fields.find((f) => 'name' in f && f.name === 'message') as any
    expect(message.label({ t: fakeT })).toBe('T(plugin-notifications:message)')

    const type = c.fields.find((f) => 'name' in f && f.name === 'type') as any
    expect(type.label({ t: fakeT })).toBe('T(plugin-notifications:type)')
    // each select option label resolves to its own type key
    const infoOption = type.options.find((o: any) => o.value === 'info')
    expect(infoOption.label({ t: fakeT })).toBe('T(plugin-notifications:typeInfo)')
  })

  test('every language block has exactly the same keys as English', () => {
    const enKeys = Object.keys(translations.en['plugin-notifications']).sort()
    for (const [lang, block] of Object.entries(translations)) {
      const keys = Object.keys((block as { 'plugin-notifications': Record<string, string> })['plugin-notifications']).sort()
      expect(keys, `language "${lang}" key set`).toEqual(enKeys)
    }
  })

  test('ships the requested languages', () => {
    for (const lang of ['ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'pl', 'ru', 'tr', 'zh']) {
      expect(translations[lang as keyof typeof translations]).toBeDefined()
    }
  })

  test('English source defines every key the UI references', () => {
    const en = translations.en['plugin-notifications']
    const keys = [
      'empty', 'link', 'loading', 'message', 'paginationLabel', 'plural', 'read',
      'recipient', 'seeAll', 'singular', 'tenant', 'type', 'typeInfo', 'typeSuccess', 'typeWarning',
    ]
    for (const k of keys) {
      expect(en[k as keyof typeof en]).toBeTruthy()
    }
  })
})
