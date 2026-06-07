# Notification UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the bell dropdown and replace the notifications list view with a clean feed — one shared `NotificationRow`, compact auto-ticking relative time, dim-when-read, and whole-row click-to-read in both surfaces. Per the approved spec `docs/superpowers/specs/2026-06-07-notification-ui-redesign-design.md`.

**Architecture:** A shared presentational `NotificationRow` atom + a pure `formatRelative` util + a `useMinuteTick` hook + a `markNotificationRead` helper. The dropdown is updated to compose the row; the list view is fully replaced via `admin.components.views.list.Component` with numbered pagination. The custom list cell is removed.

**Tech Stack:** Payload 3.84.x, Next 16, TypeScript (NodeNext ESM, `.js` specifiers), `@payloadcms/ui`, Vitest (in-memory Mongo harness).

---

## Conventions for every task

- **TDD:** failing test first (where there's pure logic), run it FAIL, implement minimal, run PASS.
- **Per-task gate (before commit):** `pnpm lint` · `npx tsc --noEmit` · `pnpm test:int`. Run one file: `pnpm test:int -- <substring>`.
- **Admin-component tasks** add a **rendered-browser visual check in light AND dark mode** (Task 7 consolidates this).
- **ESM:** `.js` import specifiers even for `.ts`/`.tsx`. Single quotes, no semicolons, trailing commas; ESLint `perfectionist` may reorder keys — let `eslint --fix` handle it.
- **Theme:** all colors via `--pn-*` vars declared at `:root` in `notifications.css` (portal-safe, light+dark). No Payload internal SCSS/class coupling.
- **Consult `frontend-design`** for the row/feed visual polish (Tasks 3 & 5 note where).

## File structure (locked)

```
src/utilities/formatRelative.ts        # NEW  pure: (dateISO, nowMs) -> { label, title }
src/utilities/markNotificationRead.ts  # NEW  pure: PATCH /api/{slug}/{id} { read:true }
src/utilities/safeHref.ts              # EXISTS (security fix 7b8b31d) — guards link before nav
src/hooks/useMinuteTick.ts             # NEW  'use client' — nowMs that ticks every 60s
src/components/NotificationRow.tsx     # NEW  'use client' — shared row atom
src/components/NotificationsListView.tsx # NEW 'use client' — full custom list view
src/components/NotificationBell.tsx    # MOD  compose NotificationRow, drop raw link
src/components/NotificationCell.tsx    # DELETE
src/collections/notifications.ts       # MOD  remove message Cell; add views.list.Component
src/exports/client.ts                  # MOD  export NotificationsListView; drop NotificationCell
src/theme/notifications.css            # MOD  row + list + pager styles; remove cell-link/meta
dev/format-relative.int.spec.ts        # NEW  unit tests for formatRelative
dev/notifications-collection.int.spec.ts # MOD assertions: views.list set, message Cell gone
dev/bell-exports.int.spec.ts           # MOD NotificationsListView exported, NotificationCell not
```

---

### Task 1: `formatRelative` util (pure, unit-tested)

**Files:** Create `src/utilities/formatRelative.ts`; Create test `dev/format-relative.int.spec.ts`.

- [ ] **Step 1: Write the failing test** at `dev/format-relative.int.spec.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { formatRelative } from '../src/utilities/formatRelative.js'

// fixed "now": 2026-06-07T12:00:00Z
const now = Date.parse('2026-06-07T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D

describe('formatRelative', () => {
  test('under 45s -> "now"', () => {
    expect(formatRelative(ago(10 * S), now).label).toBe('now')
    expect(formatRelative(ago(44 * S), now).label).toBe('now')
  })
  test('minutes', () => {
    expect(formatRelative(ago(60 * S), now).label).toBe('1m')
    expect(formatRelative(ago(40 * M), now).label).toBe('40m')
    expect(formatRelative(ago(59 * M), now).label).toBe('59m')
  })
  test('hours', () => {
    expect(formatRelative(ago(60 * M), now).label).toBe('1h')
    expect(formatRelative(ago(23 * H), now).label).toBe('23h')
  })
  test('days', () => {
    expect(formatRelative(ago(D), now).label).toBe('1d')
    expect(formatRelative(ago(6 * D), now).label).toBe('6d')
  })
  test('weeks', () => {
    expect(formatRelative(ago(W), now).label).toBe('1w')
    expect(formatRelative(ago(3 * W), now).label).toBe('3w')
  })
  test('past ~4 weeks -> absolute short date (no relative suffix)', () => {
    const label = formatRelative(ago(5 * W), now).label
    expect(label).not.toMatch(/(now|\dm|\dh|\dd|\dw)$/)
    expect(label.length).toBeGreaterThan(2) // e.g. "May 3" / "May 3, 2026"
  })
  test('title is the full localized timestamp', () => {
    const iso = ago(40 * M)
    expect(formatRelative(iso, now).title).toBe(new Date(iso).toLocaleString())
  })
  test('missing date -> empty label, empty title', () => {
    expect(formatRelative(undefined, now)).toEqual({ label: '', title: '' })
  })
})
```

- [ ] **Step 2: Run it — FAIL.** `pnpm test:int -- format-relative` → module not found.

- [ ] **Step 3: Implement `src/utilities/formatRelative.ts`:**

```ts
export type RelativeTime = { label: string; title: string }

/**
 * Compact relative time for notification rows: now / 40m / 3h / 2d / 2w, then an
 * absolute short date past ~4 weeks. `title` is the full localized timestamp (tooltip).
 */
export const formatRelative = (date: string | undefined, nowMs: number): RelativeTime => {
  if (!date) {
    return { label: '', title: '' }
  }
  const then = Date.parse(date)
  if (Number.isNaN(then)) {
    return { label: '', title: '' }
  }
  const title = new Date(then).toLocaleString()
  const diff = Math.max(0, nowMs - then)

  const S = 1000
  const MIN = 60 * S
  const H = 60 * MIN
  const D = 24 * H
  const W = 7 * D

  let label: string
  if (diff < 45 * S) {
    label = 'now'
  } else if (diff < H) {
    label = `${Math.floor(diff / MIN)}m`
  } else if (diff < D) {
    label = `${Math.floor(diff / H)}h`
  } else if (diff < W) {
    label = `${Math.floor(diff / D)}d`
  } else if (diff < 4 * W) {
    label = `${Math.floor(diff / W)}w`
  } else {
    const d = new Date(then)
    const sameYear = d.getFullYear() === new Date(nowMs).getFullYear()
    label = d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  }
  return { label, title }
}
```

- [ ] **Step 4: Run it — PASS.** `pnpm test:int -- format-relative` → 8 passing.

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/utilities/formatRelative.ts dev/format-relative.int.spec.ts
git commit -m "feat: formatRelative util for compact notification timestamps"
```

---

### Task 2: `markNotificationRead` helper + `useMinuteTick` hook

**Files:** Create `src/utilities/markNotificationRead.ts`; Create `src/hooks/useMinuteTick.ts`; Create test `dev/notif-helpers.int.spec.ts`.

- [ ] **Step 1: Write the failing test** at `dev/notif-helpers.int.spec.ts`:

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { markNotificationRead } from '../src/utilities/markNotificationRead.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('markNotificationRead', () => {
  test('PATCHes /api/{slug}/{id} with read:true and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await markNotificationRead('/api', 'notifications', 'abc123')
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/abc123', {
      body: JSON.stringify({ read: true }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    })
  })
})
```

- [ ] **Step 2: Run it — FAIL.** `pnpm test:int -- notif-helpers` → module not found.

- [ ] **Step 3: Implement `src/utilities/markNotificationRead.ts`:**

```ts
/** PATCH a notification to read=true (recipient-scoped on the server). */
export const markNotificationRead = async (
  apiRoute: string,
  slug: string,
  id: string,
): Promise<void> => {
  await fetch(`${apiRoute}/${slug}/${id}`, {
    body: JSON.stringify({ read: true }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  })
}
```

- [ ] **Step 4: Implement `src/hooks/useMinuteTick.ts`** (no separate unit test — exercised in the visual gate; keep it tiny):

```ts
'use client'
import { useEffect, useState } from 'react'

/** Returns a `nowMs` epoch that updates every `intervalMs` (default 60s) so relative
 *  timestamps re-render without a refetch. One timer per consuming surface. */
export const useMinuteTick = (intervalMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

- [ ] **Step 5: Run it — PASS.** `pnpm test:int -- notif-helpers` → 1 passing. `npx tsc --noEmit` clean (covers the hook).

- [ ] **Step 6: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/utilities/markNotificationRead.ts src/hooks/useMinuteTick.ts dev/notif-helpers.int.spec.ts
git commit -m "feat: markNotificationRead helper + useMinuteTick hook"
```

---

### Task 3: `NotificationRow` shared atom (ADMIN COMPONENT — visual gate in Task 7)

**Files:** Create `src/components/NotificationRow.tsx`; Modify `src/theme/notifications.css`.

Consult the **`frontend-design` skill** for the row treatment (spacing, hover, focus ring, the unread accent-bar + bold vs read-dimmed contrast, light/dark). Keep all colors as `--pn-*` vars.

- [ ] **Step 1: Implement `src/components/NotificationRow.tsx`:**

```tsx
'use client'
import * as React from 'react'

import { formatRelative } from '../utilities/formatRelative.js'

export type NotificationItem = {
  id: string
  createdAt?: string
  link?: string
  message: string
  read?: boolean
  type?: 'info' | 'success' | 'warning'
}

type NotificationRowProps = {
  notification: NotificationItem
  nowMs: number
  onActivate: (n: NotificationItem) => void
  size?: 'dropdown' | 'list'
}

export const NotificationRow = ({
  notification,
  nowMs,
  onActivate,
  size = 'dropdown',
}: NotificationRowProps) => {
  const { label, title } = formatRelative(notification.createdAt, nowMs)
  const cls = [
    'pn-row',
    `pn-row--${size}`,
    notification.read ? 'pn-row--read' : 'pn-row--unread',
  ].join(' ')

  return (
    <div
      className={cls}
      onClick={() => onActivate(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate(notification)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="pn-row__msg">{notification.message}</span>
      <time className="pn-row__time" title={title}>
        {label}
      </time>
    </div>
  )
}
```

- [ ] **Step 2: Add row styles to `src/theme/notifications.css`** — add an `--pn-accent` var to `:root` and the row rules; REMOVE the now-unused `.pn-cell-link*` and `.pn-meta` rules and the old `.pn-item`/`.pn-dot` rules (the bell will use `.pn-row`). Add:

```css
/* add to :root, alongside the other --pn-* vars */
  --pn-accent: var(--theme-success-500, #3b82f6);
```

```css
/* notification row (shared by the dropdown + the list view) */
.pn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--pn-border);
  border-left: 3px solid transparent;
  color: var(--pn-text);
  outline: none;
}
.pn-row:hover { background: var(--pn-bg-hover); }
.pn-row:focus-visible { box-shadow: inset 0 0 0 2px var(--pn-accent); }
.pn-row--dropdown { padding: 12px 14px 12px 11px; }
.pn-row--list { padding: 14px 16px 14px 13px; }
.pn-row--unread { border-left-color: var(--pn-accent); }
.pn-row--unread .pn-row__msg { font-weight: 600; }
.pn-row--read { opacity: 0.55; }
.pn-row__msg { flex: 1; min-width: 0; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
.pn-row--list .pn-row__msg { font-size: 14px; }
.pn-row__time { flex: none; font-size: 11px; color: var(--pn-text-muted); white-space: nowrap; }
.pn-row--list .pn-row__time { font-size: 12px; }
```

(Leave `.pn-panel`, `.pn-title`, `.pn-seeall`, `.pn-empty`, `.pn-bell` rules in place.)

- [ ] **Step 3: Gate.** `pnpm lint && npx tsc --noEmit && pnpm test:int` (35 still pass; no new test — visual gate covers rendering).

- [ ] **Step 4: Commit.**

```bash
git add src/components/NotificationRow.tsx src/theme/notifications.css
git commit -m "feat: shared NotificationRow atom + row styles"
```

---

### Task 4: Update `NotificationBell` to compose `NotificationRow`

**Files:** Modify `src/components/NotificationBell.tsx`.

- [ ] **Step 1: Rewrite `src/components/NotificationBell.tsx`** — drop the inline `.pn-item`/`.pn-dot`/`.pn-meta(link)` markup; render `NotificationRow`s; add `useMinuteTick`; route activation through `markNotificationRead`. Keep the title, SSE prepend + toast, unread count, and the conditional See-all footer:

```tsx
'use client'
import { Pill, Popup, toast, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { NotificationItem } from './NotificationRow.js'

import { useMinuteTick } from '../hooks/useMinuteTick.js'
import { markNotificationRead } from '../utilities/markNotificationRead.js'
import { safeHref } from '../utilities/safeHref.js'
import { BellIcon } from './BellIcon.js'
import { NotificationRow } from './NotificationRow.js'
import './../theme/notifications.css'

export const NotificationBell = ({
  hideFromNav = false,
  slug = 'notifications',
}: {
  hideFromNav?: boolean
  slug?: string
}) => {
  const { config } = useConfig()
  const apiRoute = config.routes.api
  const adminRoute = config.routes.admin
  const nowMs = useMinuteTick()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    const listRes = await fetch(`${apiRoute}/${slug}?depth=0&limit=20&sort=-createdAt`, {
      credentials: 'include',
    })
    if (listRes.ok) {
      const data = await listRes.json()
      setItems(data.docs ?? [])
    }
    const countRes = await fetch(`${apiRoute}/${slug}?depth=0&limit=0&where[read][equals]=false`, {
      credentials: 'include',
    })
    if (countRes.ok) {
      const data = await countRes.json()
      setUnreadCount(data.totalDocs ?? 0)
    }
  }, [apiRoute, slug])

  useEffect(() => {
    void refresh()
    const es = new EventSource(`${apiRoute}/${slug}/stream`, { withCredentials: true })
    es.onmessage = (e) => {
      try {
        const doc = JSON.parse(e.data) as NotificationItem
        setItems((prev) => [doc, ...prev].slice(0, 20))
        setUnreadCount((c) => c + 1)
        toast.info(doc.message)
      } catch {
        // keep-alive comment, ignore
      }
    }
    es.onerror = () => {
      // graceful degrade
    }
    return () => es.close()
  }, [apiRoute, slug, refresh])

  const activate = useCallback(
    async (n: NotificationItem) => {
      if (!n.read) {
        await markNotificationRead(apiRoute, slug, n.id)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      const href = safeHref(n.link)
      if (href) {
        window.location.href = href
      }
    },
    [apiRoute, slug],
  )

  return (
    <Popup
      button={
        <span aria-label="Notifications" className="pn-bell">
          <BellIcon size={20} />
          {unreadCount > 0 && <Pill>{unreadCount}</Pill>}
        </span>
      }
      onToggleOpen={(active) => {
        if (active) {
          void refresh()
        }
      }}
      render={() => (
        <div className="pn-panel" role="menu" tabIndex={-1}>
          <div className="pn-title">Notifications</div>
          {items.length === 0 && <div className="pn-empty">No notifications</div>}
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} nowMs={nowMs} onActivate={activate} size="dropdown" />
          ))}
          {!hideFromNav && (
            <a className="pn-seeall" href={`${adminRoute}/collections/${slug}`}>
              See all notifications
            </a>
          )}
        </div>
      )}
      showScrollbar
    />
  )
}
```

- [ ] **Step 2: Gate.** `pnpm lint && npx tsc --noEmit && pnpm test:int` → 35 pass (bell-exports still finds `NotificationBell`).

- [ ] **Step 3: Commit.**

```bash
git add src/components/NotificationBell.tsx
git commit -m "feat: bell dropdown uses NotificationRow (no raw link, relative time)"
```

---

### Task 5: `NotificationsListView` full custom list view (ADMIN COMPONENT — visual gate in Task 7)

**Files:** Create `src/components/NotificationsListView.tsx`; Modify `src/theme/notifications.css`.

Consult the **`frontend-design` skill** for the feed + pagination visual polish. Verify-point (Task 7): confirm the custom view keeps the admin nav/header chrome; wrap content in `@payloadcms/ui`'s `Gutter` if padding looks off.

- [ ] **Step 1: Implement `src/components/NotificationsListView.tsx`:**

```tsx
'use client'
import { Gutter, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { NotificationItem } from './NotificationRow.js'

import { useMinuteTick } from '../hooks/useMinuteTick.js'
import { markNotificationRead } from '../utilities/markNotificationRead.js'
import { safeHref } from '../utilities/safeHref.js'
import { NotificationRow } from './NotificationRow.js'
import './../theme/notifications.css'

const PAGE_SIZE = 25

export const NotificationsListView = ({ slug = 'notifications' }: { slug?: string }) => {
  const { config } = useConfig()
  const apiRoute = config.routes.api
  const nowMs = useMinuteTick()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      const res = await fetch(
        `${apiRoute}/${slug}?depth=0&limit=${PAGE_SIZE}&page=${p}&sort=-createdAt`,
        { credentials: 'include' },
      )
      if (res.ok) {
        const data = await res.json()
        setItems(data.docs ?? [])
        setTotalPages(data.totalPages ?? 1)
        setPage(data.page ?? p)
      }
      setLoading(false)
    },
    [apiRoute, slug],
  )

  useEffect(() => {
    void load(1)
  }, [load])

  const activate = useCallback(
    async (n: NotificationItem) => {
      if (!n.read) {
        await markNotificationRead(apiRoute, slug, n.id)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      }
      const href = safeHref(n.link)
      if (href) {
        window.location.href = href
      }
    },
    [apiRoute, slug],
  )

  return (
    <Gutter className="pn-list">
      <h1 className="pn-list__header">Notifications</h1>
      {loading && items.length === 0 && <div className="pn-empty">Loading…</div>}
      {!loading && items.length === 0 && <div className="pn-empty">No notifications</div>}
      <div className="pn-list__rows">
        {items.map((n) => (
          <NotificationRow key={n.id} notification={n} nowMs={nowMs} onActivate={activate} size="list" />
        ))}
      </div>
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="pn-pager">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              aria-current={p === page ? 'page' : undefined}
              className={`pn-pager__btn${p === page ? ' pn-pager__btn--active' : ''}`}
              key={p}
              onClick={() => void load(p)}
              type="button"
            >
              {p}
            </button>
          ))}
        </nav>
      )}
    </Gutter>
  )
}
```

> Slug arrives via `clientProps` (Task 6 wires `views.list.Component = { path, clientProps: { slug } }`). If `Gutter` isn't exported by the installed `@payloadcms/ui`, drop it and use `<div className="pn-list">` (confirm at implementation; the visual gate validates padding).

- [ ] **Step 2: Add list + pager styles to `src/theme/notifications.css`:**

```css
/* full list view */
.pn-list { padding-top: 24px; padding-bottom: 24px; }
.pn-list__header { font-size: 20px; font-weight: 600; margin: 0 0 16px; color: var(--pn-text); }
.pn-list__rows {
  border: 1px solid var(--pn-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--pn-bg);
}
.pn-list__rows .pn-row:last-child { border-bottom: none; }
.pn-pager { display: flex; gap: 6px; justify-content: center; margin-top: 16px; }
.pn-pager__btn {
  min-width: 30px;
  padding: 4px 9px;
  border: 1px solid var(--pn-border);
  border-radius: 5px;
  background: var(--pn-bg);
  color: var(--pn-text);
  font-size: 12px;
  cursor: pointer;
}
.pn-pager__btn:hover { background: var(--pn-bg-hover); }
.pn-pager__btn--active { background: var(--pn-accent); border-color: var(--pn-accent); color: #fff; }
```

- [ ] **Step 3: Gate.** `pnpm lint && npx tsc --noEmit && pnpm test:int` → 35 pass.

- [ ] **Step 4: Commit.**

```bash
git add src/components/NotificationsListView.tsx src/theme/notifications.css
git commit -m "feat: NotificationsListView custom feed with numbered pagination"
```

---

### Task 6: Wire the list view, remove the cell, update exports + tests + regen

**Files:** Modify `src/collections/notifications.ts`, `src/exports/client.ts`; Delete `src/components/NotificationCell.tsx`; Modify `dev/notifications-collection.int.spec.ts`, `dev/bell-exports.int.spec.ts`.

- [ ] **Step 1: Update the failing tests first.**

In `dev/notifications-collection.int.spec.ts`, replace the `message field uses the custom list cell` test with:

```ts
  test('message field has no custom Cell (full list view replaces the table)', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    const message = c.fields.find((f) => 'name' in f && f.name === 'message') as any
    expect(message.admin?.components?.Cell).toBeUndefined()
  })

  test('list view is replaced with NotificationsListView (carrying the slug)', () => {
    const c = createNotificationsCollection(sanitizeConfig({ notificationsSlug: 'notes' }))
    const list = (c.admin?.components?.views as any)?.list
    expect(list.Component.path).toBe(
      '@elghaied/payload-plugin-notifications/client#NotificationsListView',
    )
    expect(list.Component.clientProps).toEqual({ slug: 'notes' })
  })
```

In `dev/bell-exports.int.spec.ts`, replace the `NotificationCell is exported` test with:

```ts
  test('NotificationsListView is exported', () => {
    expect(client.NotificationsListView).toBeDefined()
  })
  test('NotificationCell is no longer exported', () => {
    expect((client as Record<string, unknown>).NotificationCell).toBeUndefined()
  })
```

- [ ] **Step 2: Run them — FAIL.** `pnpm test:int -- notifications-collection bell-exports` → fails (Cell still set; NotificationsListView not exported).

- [ ] **Step 3: Update `src/collections/notifications.ts`** — replace the `message` field block (remove its `admin.components.Cell`) with a plain field, and add the `views.list.Component` to the collection's `admin.components`:

```ts
      { name: 'message', type: 'text', required: true },
```

And change the `admin` block of the collection to include the custom list view:

```ts
    admin: {
      components: {
        views: {
          list: {
            Component: {
              clientProps: { slug: notificationsSlug },
              path: '@elghaied/payload-plugin-notifications/client#NotificationsListView',
            },
          },
        },
      },
      defaultColumns: ['message', 'type', 'read', 'createdAt'],
      hidden: hideFromNav,
      useAsTitle: 'message',
    },
```

- [ ] **Step 4: Update `src/exports/client.ts`:**

```ts
export { NotificationBell } from '../components/NotificationBell.js'
export { NotificationsListView } from '../components/NotificationsListView.js'
```

- [ ] **Step 5: Delete the obsolete cell.**

```bash
git rm src/components/NotificationCell.tsx
```

- [ ] **Step 6: Run tests — PASS.** `pnpm test:int -- notifications-collection bell-exports` → green.

- [ ] **Step 7: Regenerate import map + types** (new component, removed component):

```bash
pnpm dev:generate-importmap && pnpm dev:generate-types
```
Confirm `NotificationsListView` is in `dev/app/(payload)/admin/importMap.js` and `NotificationCell` is gone. Confirm **0** `generate:types` orphans (`ps … | grep "bin.js generate:types"`).

- [ ] **Step 8: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/collections/notifications.ts src/exports/client.ts dev/notifications-collection.int.spec.ts \
  dev/bell-exports.int.spec.ts dev/payload-types.ts 'dev/app/(payload)/admin/importMap.js'
git commit -m "feat: mount NotificationsListView as the list view; remove NotificationCell"
```

---

### Task 7: Visual gate (light + dark) — drive a real browser

**Files:** none (verification).

- [ ] **Step 1: Build + start.** `pnpm build && pnpm start` (background); wait for `/admin` 200.

- [ ] **Step 2: Seed a few notifications** (create Posts via REST with the session cookie, mix of read/unread) so both surfaces have content.

- [ ] **Step 3: Dropdown — verify, light AND dark** (toggle `data-theme` or the account theme):
  - No raw link path shown; **compact relative time** on the right with the **full timestamp on hover** (`title`).
  - Unread = **accent bar + bold**; read = **dimmed**.
  - **Clicking a row marks it read** (badge decrements) and navigates to its link; a link-less row marks read only.
  - SSE live-prepend + toast still works; "See all" footer present.

- [ ] **Step 4: List view — verify, light AND dark** at `/admin/collections/<slug>`:
  - It **replaces** the default table — **no** search/filter/columns/select-checkbox.
  - Feed of rows (message left, time right), read dimmed; **numbered pagination** (25/page) when >25.
  - **Whole-row click marks read** (your #1) and navigates; link-less row marks read only.
  - Admin **nav/header chrome intact**; padding looks right (adjust `Gutter`/`pn-list` if not).

- [ ] **Step 5: Capture screenshots** (light + dark, both surfaces) as evidence. Stop the server; confirm no orphan `next`/`mongod`.

> No commit (verification only). If a visual defect is found, fix in the relevant component/CSS, re-run its gate, and re-verify.

---

### Task 8: Capture — docs + changeset

**Files:** Modify `CLAUDE.md`, `README.md`; add a changeset.

- [ ] **Step 1: Update `CLAUDE.md`** Architecture/file-map: add `NotificationRow`, `NotificationsListView`, `formatRelative`, `useMinuteTick`, `markNotificationRead`; note `NotificationCell` removed and the list view is fully custom (`views.list.Component`).

- [ ] **Step 2: Update `README.md`** — mention the dropdown + full list-view feed, relative timestamps, click-to-read, and that the notifications collection's list view is replaced with a custom feed.

- [ ] **Step 3: Add a changeset** (`minor` — additive UI): `.changeset/notification-ui-redesign.md`:

```md
---
"@elghaied/payload-plugin-notifications": minor
---

Redesign the notification UI: shared row atom, compact auto-updating relative
timestamps, dim-when-read, whole-row click-to-read in both the bell dropdown and
the list view, and a fully custom notifications list view (feed + numbered
pagination) replacing the default table.
```

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md README.md .changeset
git commit -m "docs: notification UI redesign (README, CLAUDE.md, changeset)"
```

- [ ] **Step 5: Finish the branch** — use `superpowers:finishing-a-development-branch`.

---

## Self-Review (author checklist — completed)

**Spec coverage:** §1 decisions → Style B/dim/accent (Task 3 CSS), compact+tooltip (Task 1), auto-tick (Task 2 `useMinuteTick`), no-link→mark-read (Tasks 4/5 `activate`), numbered 25/page (Task 5), replace list view (Task 6). §4 NotificationRow → Task 3. §5 formatRelative/useMinuteTick → Tasks 1–2. §6 mark-read shared → Task 2 util used in Tasks 4 & 5. §7 dropdown → Task 4. §8 list view → Task 5. §9 wiring/exports/regen → Task 6. §10 CSS → Tasks 3 & 5. §11 testing → Tasks 1,2,6 + Task 7 visual. §13 acceptance → AC1 Task 4, AC2 Tasks 1–2, AC3 Tasks 5–6, AC4 Tasks 4–5, AC5 Tasks 3/7, AC6 Task 6/7. No gaps.

**Placeholder scan:** no TBD/TODO; every code step is complete. Two explicit verify-points (custom-view chrome/`Gutter`, `@payloadcms/ui` `Gutter` export) are written as "confirm at implementation / visual gate," not missing content.

**Type consistency:** `NotificationItem` defined in Task 3, imported by Tasks 4 & 5. `formatRelative(date, nowMs) -> { label, title }` (Task 1) used in Task 3. `markNotificationRead(apiRoute, slug, id)` (Task 2) used in Tasks 4 & 5. `useMinuteTick()` (Task 2) used in Tasks 4 & 5. Component path string `…/client#NotificationsListView` matches the export (Task 6) and the wiring (Task 6). `clientProps: { slug }` consistent across collection wiring and the component prop.
