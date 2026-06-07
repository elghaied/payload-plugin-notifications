# @elghaied/payload-plugin-notifications

## 1.0.0

Initial release — in-dashboard notifications for the Payload admin with a live SSE bell.

### Features

- **In-app notifications with a live SSE bell.**
  - `notifications` collection (recipient-scoped access; system-only create; hidden from nav).
  - `pushNotification(payload, args)` write API.
  - `afterChange` fan-out hook + `/stream` SSE collection endpoint (in-memory connection registry).
  - `NotificationBell` admin component (live unread badge, dropdown, mark-as-read, click-to-navigate) with a CSS-variable theme-indirection layer.
  - Optional, default-off multi-tenant scoping via the `tenants` config.

- **Shared notification UI across the bell and the list view.**
  - One row shared by both surfaces: compact, auto-updating relative timestamps (`now` / `40m` / `2d`, full timestamp on hover), unread rows accented and read rows dimmed, whole-row click that marks the notification read and navigates to its target.
  - The notifications collection's list view is fully replaced with a clean, numbered-paginated feed (no search/filter/columns/select).
  - Notification links are scheme-validated before navigation (rejects `javascript:` / `data:` — XSS hardening).

- **Internationalization** (field labels, collection labels, and admin UI strings).
  - A `src/translations` module following the official `@payloadcms/plugin-*` structure: one `GenericTranslationsObject` file per language under the `plugin-notifications` namespace, assembled in `index.ts` with `PluginNotificationsTranslations` / `PluginNotificationsTranslationKeys` exports.
  - Merges into `config.i18n.translations` via `deepMergeSimple` (user translations win on conflict).
  - Ships 12 languages: ar, de, en, es, fr, hi, id, it, pl, ru, tr, zh.
  - RTL-safe theme CSS (logical properties) so the accent bar flips correctly in Arabic.

- Relative timestamps clamp sub-minute values to `1m` (never `0m`); anything under the 45s cutoff reads `now`.
