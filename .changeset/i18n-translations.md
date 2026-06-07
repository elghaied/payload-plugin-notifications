---
"@elghaied/payload-plugin-notifications": minor
---

Internationalize the plugin (field labels, collection labels, and admin UI strings).

- Adds a `src/translations` module following the official `@payloadcms/plugin-*` structure: one `GenericTranslationsObject` file per language under the `plugin-notifications` namespace, assembled in `index.ts` with `PluginNotificationsTranslations` / `PluginNotificationsTranslationKeys` exports.
- Merges into `config.i18n.translations` via `deepMergeSimple` (user translations win on conflict).
- Ships 12 languages: ar, de, en, es, fr, hi, id, it, pl, ru, tr, zh.
- RTL-safe theme CSS (logical properties) so the accent bar flips correctly in Arabic.
