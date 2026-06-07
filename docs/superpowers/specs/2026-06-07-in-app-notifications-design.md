# In-app Notifications Plugin — Design

**Package:** `@elghaied/payload-plugin-notifications`
**Date:** 2026-06-07
**Status:** Approved (brainstorm) — pending implementation plan

In-dashboard notifications for the Payload CMS 3.x admin: a `notifications` collection plus a
live **NotificationBell** in the admin top bar that updates without a page refresh. Built under
the `payload-plugin-workflow` discipline (additive, default-off, V4-safe, adapter-agnostic).

---

## 1. Decisions locked in brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | **Database posture** | **Adapter-agnostic.** Works on any Payload adapter (Mongo or Postgres). Dev-tested on the bootstrapped in-memory Mongo harness. **Ids opaque** — never parsed or assumed numeric/string. |
| 2 | **Multi-tenancy** | **Optional, config-driven** (`tenants` block). When set, the plugin adds a `tenant` relationship field + ANDs a tenant filter into `access.read`. When omitted: zero tenant field, recipient-only scoping. Interoperates with `@payloadcms/plugin-multi-tenant` but does **not** depend on it. |
| 3 | **Live channel** | **SSE primary + graceful REST degrade.** SSE pushes via an in-memory registry; the bell also REST-fetches unread on mount and on dropdown-open, so counts stay accurate even where SSE never connects. No separate polling subsystem. |
| 4 | **Access model** | **System-only create, recipient-scoped read/update/delete.** REST `create` = `false`; `pushNotification()` writes via `overrideAccess: true`. Collection hidden from admin nav by default. |
| 5 | **SSE transport** | **Approach A — plugin-shipped collection endpoint**, gated by a Phase-0 streaming spike. **Fall back to Approach B** (exported Next.js route handler) if the spike shows buffering or no abort signal. |

---

## 2. Architecture — two decoupled layers

1. **Source of truth = a DB row** in the `notifications` collection (adapter-agnostic). A user sees
   their notifications regardless of whether any admin tab was open when the notification was created.
2. **Live channel = best-effort SSE** push to currently-open admin tabs, via an **in-memory
   connection registry**. The live push is a **side effect of the DB write, never a separate write
   path**.
3. **Single fan-out point:** one `afterChange` hook on the `notifications` collection. On
   `operation === 'create'`, it emits the created doc to that recipient's open SSE connections.
   This is the **only** place live push is triggered.

Deployment target: a single long-running Node process (self-hosted), where SSE connections hold.
The graceful-degrade path (decision 3) covers serverless / buffering-proxy installs.

---

## 3. `notifications` collection

| field | type | notes |
|---|---|---|
| `recipient` | relationship → `usersSlug` | **required** |
| `tenant` | relationship → `tenantsSlug` | **added only when `tenants` config is set; `required: true` when added** (so every row is tenant-scoped). May be auto-assigned by `@payloadcms/plugin-multi-tenant` if present. |
| `message` | text | **required** |
| `link` | text | e.g. `/admin/collections/invoices/123` |
| `type` | select: `info \| warning \| success` | default `info` |
| `read` | checkbox | default `false`, indexed |

- `timestamps: true` — `createdAt` is the ordering key (newest first).
- `admin.hidden` = `hideFromNav` (default `true`) — the bell is the UI surface.
- `admin.useAsTitle: 'message'`.
- **Ids opaque** throughout; no adapter-specific id handling.

---

## 4. Access control

Recipient-scoped, tenant-aware, system-only creation:

- **`read`**: `({ req }) => req.user ? { recipient: { equals: req.user.id }, ...(tenant filter) } : false`.
  When multi-tenant is on, the tenant filter is ANDed in.
- **`create`**: `() => false` (REST). Notifications are system-generated; `pushNotification()`
  bypasses with `overrideAccess: true`.
- **`update`** / **`delete`**: `({ req }) => req.user ? { recipient: { equals: req.user.id } } : false`
  — a user may mark-read / dismiss only their own.

Security notes (from the `payload` skill): Local API bypasses access by default — `pushNotification`
deliberately uses `overrideAccess: true` for system writes; any on-behalf-of-user REST path keeps
the scoped access above.

---

## 5. `pushNotification()` — public write API

```ts
pushNotification(payload, {
  recipient,            // user id (opaque)
  message,
  link?,
  type? = 'info',
  tenant?,              // required when multi-tenant is configured (unless auto-assigned); ignored otherwise
  req?,                 // pass when called inside a hook → joins the same transaction
}) => payload.create({
  collection: notificationsSlug,
  data: { recipient, message, link, type, tenant },
  overrideAccess: true,
  req,
})
```

- Exported from the **package root**. Callable from any hook, endpoint, or job.
- **Transaction rule:** when invoked from inside a hook, the caller passes `req` so the create
  participates in the same transaction (per the payload-skill transaction guidance).
- **Future seam:** this is the single documented point where a `payload.jobs.queue()` swap would go
  for non-blocking / scheduled / digest notifications. v1 keeps the direct call.

---

## 6. SSE transport — Approach A (spike-gated)

- A **collection endpoint** `{ path: '/stream', method: 'get', handler }` on the notifications
  collection → mounted at **`/api/notifications/stream`**, with `req.user` already cookie-authed by
  Payload's middleware (no manual `payload.auth({ headers })`).
- Handler returns a streaming `text/event-stream` `Response` **immediately**, then registers the
  stream controller in the registry; cleans up on request abort.
- **Phase-0 spike (gate):** on the Mongo harness, confirm Payload's endpoint layer (a) flushes
  events live without buffering and (b) exposes an abort signal for cleanup. **If the spike fails,
  fall back to Approach B** below — no design rework.

### Approach B — fallback (exported Next.js route handler)
The plugin exports a `createStreamRoute()` handler; the installer (and the dev app) mount it at
`app/api/notifications/stream/route.ts` with `export const runtime = 'nodejs'`, authing via
`payload.auth({ headers })`, returning the `Response` immediately before the write loop. Proven
streaming behavior; cost is a required route file per install (documented).

---

## 7. Connection registry — interface + in-memory impl

```ts
interface NotificationRegistry {
  register(userId: string, controller: ReadableStreamDefaultController): void
  unregister(userId: string, controller: ReadableStreamDefaultController): void
  emitToUser(userId: string, payload: unknown): void
}
```

- **`InMemoryRegistry`** — `Map<userId, Set<controller>>`; the only implementation built in v1.
  Module-level singleton within the single Node process.
- **Distributed adapter = documented extension point, NOT built.** Both Postgres `LISTEN/NOTIFY`
  and Mongo change streams are noted as drop-in `NotificationRegistry` implementations for a
  multi-replica future. **No Redis.**

---

## 8. UI — `NotificationBell` client component

- `'use client'`. Injected via
  `config.admin.components.actions.push('@elghaied/payload-plugin-notifications/client#NotificationBell')`.
- **Mount:** REST-fetch unread for the initial count → open `EventSource('/api/notifications/stream')`
  → prepend incoming notifications. **Re-fetch on dropdown-open** (graceful-degrade path).
- **Primitives:** public `@payloadcms/ui` only — `Popup` (dropdown panel), `Pill` (unread badge),
  the toast system (transient toast on live arrival). Exact import names confirmed against
  `@payloadcms/ui` at implementation time.
- **Interaction:** clicking a notification navigates to its `link` and PATCHes `read: true` via REST.
- **Visual (approved mockup):** bell icon + numeric unread `Pill`; dropdown lists items with a
  per-`type` color accent and read/unread state; "Mark all read" / "View all" affordances; live
  toast on arrival.

### Theme rule (V4-safety — firm)
- All Payload theme references go through a **single CSS-variables indirection file**
  (`src/theme/notifications.css`). No internal Payload SCSS variable or class names referenced
  anywhere else.
- `@payloadcms/ui` `Popup`/toast render in a **portal at `<body>`, outside the field/action
  wrapper**. The indirection variables MUST be declared where the portal can see them (`:root` or
  the portal element) — never scoped only to a wrapper the portal escapes.
- Any Tailwind (if used at all) gets its preflight scoped in an isolated interop layer.
- Components use only Payload's **public** component API; the bell is a **client** component (Payload
  custom components are RSC by default; action/nav server slots can't access `req`, which is fine —
  the bell uses cookie-authed REST/SSE).

---

## 9. Configuration (all additive; plugin default-off via `disabled`)

```ts
notificationsPlugin({
  disabled?: boolean,          // installed but inert; schema stays stable
  notificationsSlug?: string,  // default 'notifications'
  usersSlug?: string,          // default 'users'
  tenants?: {                  // OMITTED ⇒ no tenant field, recipient-only scoping
    tenantsSlug?: string,      // default 'tenants'
    tenantFieldName?: string,  // default 'tenant'
  },
  hideFromNav?: boolean,       // default true
})
```

---

## 10. File layout (workflow layered convention)

```
src/
  index.ts                          // plugin: (opts) => (config) => Config
  collections/notifications.ts      // createNotificationsCollection(opts)
  hooks/fanout.ts                   // afterChange → registry.emitToUser
  endpoints/stream.ts               // SSE collection endpoint (Approach A)
  registry/index.ts                 // NotificationRegistry interface + InMemoryRegistry
  pushNotification.ts               // public write API
  components/NotificationBell.tsx   // 'use client'
  theme/notifications.css           // the single CSS-variables indirection file
  exports/client.ts                 // re-export NotificationBell
  exports/rsc.ts                    // empty for now
```

The plugin function (`src/index.ts`): preserves existing `config.collections` / `config.endpoints`
/ `config.admin.components` / `onInit`; pushes the collection (with its `/stream` endpoint and
fan-out hook), the bell into `admin.components.actions`; honors `disabled` by returning config
unmodified-but-schema-stable.

---

## 11. Phase order & verification gates

- **Phase 0 — Research / spike.** Map the flow end-to-end; read Payload docs (endpoints, admin
  components) via the `payload` skill. **Run the SSE streaming spike** that decides Approach A vs B.
- **Phase 1 — Brainstorm / plan.** This spec → `/superpowers:write-plan`.
- **Phase 2 — TDD per task.** Red→green. **Per-task gate:** `pnpm lint` + `npx tsc --noEmit` +
  `pnpm test:int`, every task. Integration coverage: collection schema; recipient + tenant access
  isolation; `pushNotification` create; fan-out hook emits to a mockable registry; SSE endpoint
  auth + stream.
- **Phase 3 — Verify (Payload checklist).** Regenerate types + importmap (via the reaping wrapper);
  `pnpm build && pnpm start` (prod parity, not just `dev`); and **look at the bell rendered in a
  real browser** — verify the specific claims: badge updates live without refresh; dropdown theme
  correct **including the portal-rendered `Popup`/toast**; click navigates and marks read.
- **Phase 4 — Capture.** Fold proven patterns into `CLAUDE.md`; add **one changeset** (additive →
  minor).

---

## 12. Out of scope (clean seams, not built)

- **Jobs Queue** for non-blocking generation and scheduled/digest notifications — seam documented at
  `pushNotification()`; v1 uses direct calls.
- **Distributed registry adapter** (Postgres `LISTEN/NOTIFY` / Mongo change streams) — interface
  only, stubbed note, not wired.
- **Redis** — explicitly excluded.

---

## 13. Acceptance criteria

1. Installing the plugin (default config) adds a `notifications` collection (hidden from nav) and a
   live bell in the admin top bar; **`disabled: true`** leaves the schema present but the plugin
   inert.
2. A user only ever reads notifications where they are the `recipient` (and, when multi-tenant is on,
   within their tenant). REST `create` is denied; `update`/`delete` limited to own rows.
3. `pushNotification(payload, {...})` creates a row; with SSE connected, the recipient's open tabs
   receive it live (toast + badge increment) **without a page refresh**; with SSE unavailable, the
   count is still accurate on mount / dropdown-open.
4. Clicking a notification navigates to its `link` and marks it read.
5. No internal Payload SCSS/class coupling; theme variables reachable by the portal-rendered
   `Popup`/toast. Verified rendered in a browser on a `build && start` prod build.
6. `pnpm lint` + `npx tsc --noEmit` + `pnpm test:int` green; types/importmap regenerated; one
   changeset added.
