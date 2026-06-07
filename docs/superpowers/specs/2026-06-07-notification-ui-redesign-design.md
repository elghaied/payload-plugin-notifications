# Notification UI Redesign — Design

**Package:** `@elghaied/payload-plugin-notifications`
**Date:** 2026-06-07
**Status:** Approved (brainstorm) — pending implementation plan

Redesign the two notification UI surfaces — the **bell dropdown** and the **collection list view** —
into a clean, feed-style experience with a single shared row, relative timestamps, and whole-row
click-to-read behavior.

---

## 1. Decisions locked in brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | **Row style** | **Style B** — unread = left **accent bar + bold**; read = **dimmed**, no bar; no dot. Message left, time right. |
| 2 | **Relative-time format** | **Compact + tooltip** — `now` / `40m` / `3h` / `2d` / `2w`, absolute short date past ~4 weeks; full timestamp in the `title` (hover) attribute. |
| 3 | **Live time** | **Auto-tick each minute** — one timer per surface updates a shared `now`; rows recompute their label. |
| 4 | **No-link click** | **Mark read only** — clicking a link-less row marks it read (dims) and stays; no navigation. |
| 5 | **List pagination** | **Numbered pages, 25 per page.** |
| 6 | **List view** | **Replace entirely** via `admin.components.views.list.Component` — no search/filter/columns/select. |

---

## 2. Problems being fixed

- Dropdown shows the raw `link` path (`/admin/collections/posts/…`) — should be hidden; show relative time instead.
- Read state is only set from the bell — clicking a **list-view** row must mark it read too.
- The list view is Payload's default table (search, filters, columns, select checkboxes, click-to-edit)
  — should be a clean notifications feed with whole-row click that goes to the notification's target.
- No timestamps shown anywhere.

---

## 3. Architecture — one shared row + a replaced list view

Both surfaces compose the same presentational atom; only their data-loading differs.

```
src/components/
  NotificationRow.tsx        # 'use client' — the shared row atom
  NotificationBell.tsx       # dropdown — uses NotificationRow (updated)
  NotificationsListView.tsx  # 'use client' — full custom list view (new)
  BellIcon.tsx               # (unchanged)
src/utilities/
  formatRelative.ts          # pure: (date, now) -> { label, title }
  markNotificationRead.ts    # pure helper: PATCH /api/{slug}/{id} { read: true }
src/hooks/
  useMinuteTick.ts           # 'use client' — shared `now`, ticks every 60s
src/theme/notifications.css  # row + list-view + pagination styles
```

**Removed:** `src/components/NotificationCell.tsx` and the `message` field's `admin.components.Cell`
(obsolete once the whole list view is replaced).

---

## 4. `NotificationRow` (the shared atom)

```ts
type NotificationRowProps = {
  notification: { id: string; message: string; link?: string; read?: boolean; createdAt?: string; type?: 'info' | 'warning' | 'success' }
  now: number                 // ms epoch, from useMinuteTick (passed by the parent surface)
  onActivate: (n) => void     // parent supplies mark-read(+navigate) behavior
  size?: 'dropdown' | 'list'  // density only (padding/font); same structure
}
```

- Renders a **focusable, clickable** row (`role="button"`/`menuitem`, `tabIndex=0`, Enter/Space).
- **Unread:** left **accent bar** + **semibold** message. **Read:** no bar, normal weight, container
  **dimmed** (opacity). State driven by CSS classes (`.pn-row`, `.pn-row--unread`, `.pn-row--read`).
- Message in a flex-1 cell (truncate/wrap per size); **relative time** on the right via
  `formatRelative(createdAt, now)`, with `title={absolute localized timestamp}`.
- All color/spacing through the **CSS-variable indirection** (`notifications.css`, vars at `:root`
  so the portal-rendered dropdown reads them). Works in light + dark mode.

---

## 5. `formatRelative(date, now)` (pure util)

Compact thresholds: `< 45s → "now"`, `< 60m → "{m}m"`, `< 24h → "{h}h"`, `< 7d → "{d}d"`,
`< 4w → "{w}w"`, else absolute short date (e.g. `Jun 7`). Returns `{ label, title }` where `title`
is the full localized timestamp for the tooltip. **Pure and unit-tested** at each boundary.

`useMinuteTick()` ('use client'): one `setInterval(60_000)` per surface, returns a `now` number that
changes each minute so rows re-render their labels without a refetch. Cleared on unmount.

---

## 6. Activation / mark-read (shared)

`markNotificationRead(apiRoute, slug, id)` → `PATCH /api/{slug}/{id}` body `{ read: true }`
(`credentials: 'include'`). Each surface wraps it in an `onActivate(n)`:

1. If `!n.read`: PATCH read, optimistically update local state, decrement the unread count.
2. If `n.link`: `window.location.href = n.link`. Else: stay (mark-read-only — decision #4).

This is now the **single** path for marking read; clicking a row in **either** surface marks it read
(fixes "read only from the bell").

---

## 7. Bell dropdown (`NotificationBell`) — updated

- Replace the inline item markup (and the **raw `link` line**) with `NotificationRow`s.
- Keep: the "Notifications" title, initial + on-open REST fetch (recent read+unread, limit 20),
  authoritative unread count, **SSE** live-prepend + `toast.info`, and the **"See all"** footer
  (hidden when `hideFromNav`).
- Add a `useMinuteTick()` `now`, passed to each row. `onActivate` = shared mark-read(+navigate).

---

## 8. Full list view (`NotificationsListView`) — new

- Mounted via `admin.components.views.list.Component` on the notifications collection.
- `'use client'`. Fetches recipient-scoped `GET /api/{slug}?depth=0&sort=-createdAt&limit=25&page=N`.
- Renders: a header (“Notifications”), the list of `NotificationRow`s (`size="list"`), **numbered
  pagination** built from the REST response (`totalPages`, `page`, `hasPrevPage`, `hasNextPage`),
  and **empty** ("No notifications") + **loading** states.
- `onActivate` = shared mark-read(+navigate); after marking read, update that row in place (stays
  visible, dims).
- **Verify point:** confirm the custom `views.list.Component` retains the admin shell (nav sidebar,
  header) and only swaps the list content; wrap in Payload's `Gutter` (or equivalent) if needed for
  correct page padding. Confirm during the visual gate.

---

## 9. Collection / plugin wiring

- `createNotificationsCollection`: remove the `message` field `admin.components.Cell`; add
  `admin.components.views.list.Component = '@elghaied/payload-plugin-notifications/client#NotificationsListView'`.
- `exports/client.ts`: export `NotificationsListView` (+ keep `NotificationBell`); remove
  `NotificationCell`.
- `index.ts`: unchanged bell injection (clientProps `{ slug, hideFromNav }`). Regenerate the import
  map (new component).

---

## 10. Theme (`notifications.css`)

Add: `.pn-row` (+`--unread`/`--read`), `.pn-row__msg`, `.pn-row__time`, the list-view container
(`.pn-list`, `.pn-list__header`), and pagination (`.pn-pager`, active/disabled). Reuse existing
`--pn-*` vars; add any new ones (e.g. `--pn-accent` for the unread bar) at `:root`. Remove the old
`.pn-cell-link*` / `.pn-meta` rules. No coupling to Payload's internal SCSS/class names.

---

## 11. Testing & verification

- **Unit:** `formatRelative` boundaries (`now`/`m`/`h`/`d`/`w`/absolute) and the `title` value.
- **Collection factory:** asserts `views.list.Component` is set and the message-field `Cell` is gone.
- **Client exports smoke:** `NotificationsListView` exported, `NotificationCell` not.
- **Per-task gate:** `pnpm lint` + `tsc --noEmit` + `pnpm test:int`.
- **Visual gate (real browser, prod build, light AND dark):**
  - Dropdown: no raw link; compact time with hover tooltip; unread accent-bar+bold, read dimmed;
    row click marks read + navigates; live SSE still works.
  - List view: replaces the default table (no search/filter/columns/select); numbered pagination
    (25/page); whole-row click marks read + navigates; link-less row click marks read only; admin
    chrome intact.
  - **`frontend-design` skill** drives the visual polish (spacing, hover/focus states, accent/dim
    treatment, light/dark contrast).

---

## 12. Out of scope (YAGNI)

- Mark-all-read / bulk actions, filters/tabs (all/unread), grouping by date, per-row dismiss/delete
  buttons, infinite scroll. Not requested.

---

## 13. Acceptance criteria

1. Dropdown rows show **no raw link**, show **compact relative time** (tooltip = full timestamp),
   unread = accent-bar+bold, read = dimmed.
2. Relative labels **auto-update** ~each minute without a refresh.
3. The notifications **list view is fully replaced** — no search/filter/columns/select; a feed of
   clickable rows with numbered pagination (25/page).
4. **Clicking a row in the list view marks it read** (and navigates to its `link`; link-less →
   mark-read only), as does clicking in the dropdown — one shared path.
5. Read rows are dimmed in both surfaces; both work in light and dark mode via the CSS-variable
   indirection.
6. `NotificationCell` and the message-field `Cell` are removed; types/import map regenerated;
   `lint` + `tsc` + `test:int` green; verified rendered in a real browser.
