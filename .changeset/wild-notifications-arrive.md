---
"@elghaied/payload-plugin-notifications": minor
---

Add in-app notifications with a live SSE bell.

- `notifications` collection (recipient-scoped access; system-only create; hidden from nav)
- `pushNotification(payload, args)` write API
- `afterChange` fan-out hook + `/stream` SSE collection endpoint (in-memory connection registry)
- `NotificationBell` admin component (live unread badge, dropdown, mark-as-read, click-to-navigate) with a CSS-variable theme-indirection layer
- Optional, default-off multi-tenant scoping via the `tenants` config
