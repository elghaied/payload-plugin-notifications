import type { GenericTranslationsObject, NestedKeysStripped } from '@payloadcms/translations'

import { ar } from './ar.js'
import { de } from './de.js'
import { en } from './en.js'
import { es } from './es.js'
import { fr } from './fr.js'
import { hi } from './hi.js'
import { id } from './id.js'
import { it } from './it.js'
import { pl } from './pl.js'
import { ru } from './ru.js'
import { tr } from './tr.js'
import { zh } from './zh.js'

export const translations = {
  id,
  ar,
  de,
  en,
  es,
  fr,
  hi,
  it,
  pl,
  ru,
  tr,
  zh,
}

export type PluginNotificationsTranslations = GenericTranslationsObject
export type PluginNotificationsTranslationKeys = NestedKeysStripped<PluginNotificationsTranslations>
