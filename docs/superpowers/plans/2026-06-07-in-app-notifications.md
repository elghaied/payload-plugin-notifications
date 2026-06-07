# In-app Notifications Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@elghaied/payload-plugin-notifications` — in-admin notifications with a live SSE bell — per the approved spec at `docs/superpowers/specs/2026-06-07-in-app-notifications-design.md`.

**Architecture:** Two decoupled layers. (1) Source of truth = a `notifications` collection row (adapter-agnostic, opaque ids). (2) Live channel = best-effort SSE push to open admin tabs via an in-memory connection registry, triggered as a side effect by a single `afterChange` fan-out hook on the collection. A client `NotificationBell` (Payload `Popup`/`Pill`/toast) renders in `admin.components.actions`.

**Tech Stack:** Payload CMS 3.84.x, Next.js 16, TypeScript (NodeNext ESM, `.js` import specifiers), Vitest (in-memory Mongo harness), `@payloadcms/ui`, SSE via a Payload collection endpoint.

---

## Conventions for every task

- **TDD:** write the failing test first, run it, watch it FAIL, then implement minimally, run it PASS.
- **Per-task gate (all must pass before commit):** `pnpm lint` · `npx tsc --noEmit` · `pnpm test:int`.
- **Admin-component tasks** additionally require a **rendered browser check** (screenshot / computed style), not just a green build.
- **Consult the `payload` skill** before writing each Payload-specific piece; don't improvise framework APIs.
- **Tests live in `dev/*.int.spec.ts`** (the vitest `include` glob). Pure-unit tests may share that suffix — they just don't boot Payload.
- **ESM:** all relative imports use `.js` specifiers even for `.ts` sources. Single quotes, no semicolons, trailing commas (Prettier).
- **Ids opaque:** never parse or assume an id's runtime type.
- **Commit** after each task with a conventional message.

## File Structure (locked decomposition)

```
src/
  index.ts                          # plugin entry: payloadPluginNotifications = (opts) => (config) => Config
  types.ts                          # NotificationsPluginConfig + SanitizedConfig + defaults/sanitizer
  registry/index.ts                 # NotificationRegistry interface + InMemoryRegistry + module singleton
  collections/notifications.ts      # createNotificationsCollection(sanitized) -> CollectionConfig
  hooks/fanout.ts                   # createFanoutHook(registry) -> CollectionAfterChangeHook
  endpoints/stream.ts               # createStreamEndpoint(registry) -> Endpoint ('/stream' on the collection)
  pushNotification.ts               # pushNotification(payload, args) public write API
  components/NotificationBell.tsx    # 'use client' bell (Popup/Pill/toast)
  theme/notifications.css           # single CSS-variables indirection file
  exports/client.ts                 # re-export NotificationBell
  exports/rsc.ts                    # (empty)
dev/
  payload.config.ts                 # wires the plugin (recipient-only mode) for manual + e2e
  *.int.spec.ts                     # tests
```

Each `src` file has one responsibility and a small public surface; the registry and hook are injected (factories take their deps) so they unit-test without a DB or server.

---

## Phase 0 — SSE streaming spike (decision gate: Approach A vs B)

**Why:** The whole design assumes a Payload collection endpoint can return a long-lived `text/event-stream` Response that flushes **incrementally** (not buffered) and lets us clean up on client disconnect. If Payload's endpoint layer buffers the body or hides the abort signal, we fall back to Approach B (exported Next.js route). This spike answers that before we build on it.

### Task 0: Run the streaming spike

**Files:**
- Modify (temporary): `dev/payload.config.ts` — add a throwaway streaming endpoint to the injected `users` collection or as a root endpoint.

- [ ] **Step 1: Add a throwaway streaming endpoint.** In `dev/payload.config.ts`, inside `buildConfig({...})`, add a root-level `endpoints` array with a counter stream:

```ts
  endpoints: [
    {
      path: '/spike-stream',
      method: 'get',
      handler: (req) => {
        const encoder = new TextEncoder()
        let n = 0
        let timer: ReturnType<typeof setInterval> | undefined
        const stream = new ReadableStream({
          start(controller) {
            timer = setInterval(() => {
              n += 1
              controller.enqueue(encoder.encode(`data: tick ${n}\n\n`))
              if (n >= 5) {
                clearInterval(timer)
                controller.close()
              }
            }, 1000)
          },
          cancel() {
            if (timer) clearInterval(timer)
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        })
      },
    },
  ],
```

- [ ] **Step 2: Boot the dev server.**

Run: `pnpm dev` (in a background shell)
Expected: Next ready on `http://localhost:3000`; `/spike-stream` mounts at `/api/spike-stream`.

- [ ] **Step 3: Probe the stream and observe TIMING.** In a second shell:

Run: `curl -N -s http://localhost:3000/api/spike-stream`
Expected (the decision criterion): the five `data: tick N` lines arrive **one per second, incrementally** — NOT all at once after ~5s. `-N` disables curl buffering so you see real flush timing.

- [ ] **Step 4: Verify disconnect cleanup.** Re-run the curl and Ctrl-C it after ~2 ticks. Confirm the server logs no error loop and the `cancel()` path is reachable (add a temporary `console.log('spike cancel')` in `cancel()` if you want explicit proof).

- [ ] **Step 5: Record the decision.** 
  - **If ticks arrive incrementally + cancel fires → Approach A confirmed.** Proceed with the plan as written (collection endpoint).
  - **If ticks are buffered (all arrive together) or no abort signal → fall back to Approach B.** Stop and revise Task 9 to export a Next.js route handler (`createStreamRoute`) that the dev app mounts at `dev/app/(payload)/api/notifications/stream/route.ts` with `export const runtime = 'nodejs'` and `payload.auth({ headers })`; the registry/hook/UI tasks are unchanged.
  - Write one line into `CLAUDE.md` under Architecture: `SSE transport: Approach A (endpoint)` or `Approach B (route)`, with the spike date.

- [ ] **Step 6: Remove the throwaway endpoint** from `dev/payload.config.ts` and stop the dev server. Do NOT commit the spike code.

```bash
git diff --stat   # expect: no changes staged from the spike
```

> The remaining tasks assume **Approach A**. If the spike chose B, apply the Task 9 note before implementing it.

---

## Phase 2 — Implementation (TDD)

### Task 1: Package metadata + config types

**Files:**
- Modify: `package.json` (name, description, author)
- Create: `src/types.ts`
- Test: `dev/config-sanitize.int.spec.ts`

- [ ] **Step 1: Rename the package** so the component import paths resolve. In `package.json` set:

```json
  "name": "@elghaied/payload-plugin-notifications",
  "description": "In-dashboard notifications for the Payload admin, with a live SSE bell.",
  "author": "elghaied",
```

Leave the `exports` map (`.`, `./client`, `./rsc`) untouched.

- [ ] **Step 2: Update the dev self-import.** In `dev/payload.config.ts` change the import specifier to the new name:

```ts
import { payloadPluginNotifications } from '@elghaied/payload-plugin-notifications'
```

- [ ] **Step 3: Write the failing test** for config sanitization at `dev/config-sanitize.int.spec.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { sanitizeConfig } from '../src/types.js'

describe('sanitizeConfig', () => {
  test('applies defaults when given an empty object', () => {
    const c = sanitizeConfig({})
    expect(c.notificationsSlug).toBe('notifications')
    expect(c.usersSlug).toBe('users')
    expect(c.hideFromNav).toBe(true)
    expect(c.tenants).toBeNull()
  })

  test('normalizes a tenants block with its own defaults', () => {
    const c = sanitizeConfig({ tenants: {} })
    expect(c.tenants).toEqual({ tenantsSlug: 'tenants', tenantFieldName: 'tenant' })
  })

  test('respects explicit overrides', () => {
    const c = sanitizeConfig({
      notificationsSlug: 'notes',
      usersSlug: 'admins',
      hideFromNav: false,
      tenants: { tenantsSlug: 'orgs', tenantFieldName: 'org' },
    })
    expect(c.notificationsSlug).toBe('notes')
    expect(c.usersSlug).toBe('admins')
    expect(c.hideFromNav).toBe(false)
    expect(c.tenants).toEqual({ tenantsSlug: 'orgs', tenantFieldName: 'org' })
  })
})
```

- [ ] **Step 4: Run it — expect FAIL.**

Run: `pnpm test:int -- config-sanitize`
Expected: FAIL — `sanitizeConfig` is not exported / `src/types.ts` missing.

- [ ] **Step 5: Implement `src/types.ts`:**

```ts
import type { CollectionSlug } from 'payload'

export interface TenantsConfig {
  /** Slug of the tenants collection. @default 'tenants' */
  tenantsSlug?: string
  /** Name of the tenant relationship field added to notifications. @default 'tenant' */
  tenantFieldName?: string
}

export interface NotificationsPluginConfig {
  /** Installed but inert; schema stays stable. @default false */
  disabled?: boolean
  /** Slug for the notifications collection. @default 'notifications' */
  notificationsSlug?: string
  /** Slug of the auth collection notifications are addressed to. @default 'users' */
  usersSlug?: string
  /** Enable multi-tenant scoping. Omit for single-tenant (recipient-only). */
  tenants?: TenantsConfig
  /** Hide the notifications collection from the admin nav. @default true */
  hideFromNav?: boolean
}

export interface SanitizedTenantsConfig {
  tenantsSlug: string
  tenantFieldName: string
}

export interface SanitizedConfig {
  disabled: boolean
  notificationsSlug: string
  usersSlug: string
  tenants: SanitizedTenantsConfig | null
  hideFromNav: boolean
}

export const sanitizeConfig = (opts: NotificationsPluginConfig = {}): SanitizedConfig => ({
  disabled: opts.disabled ?? false,
  notificationsSlug: opts.notificationsSlug ?? 'notifications',
  usersSlug: opts.usersSlug ?? 'users',
  hideFromNav: opts.hideFromNav ?? true,
  tenants: opts.tenants
    ? {
        tenantsSlug: opts.tenants.tenantsSlug ?? 'tenants',
        tenantFieldName: opts.tenants.tenantFieldName ?? 'tenant',
      }
    : null,
})

// Re-exported for the package root types entry.
export type NotificationType = 'info' | 'warning' | 'success'
export const NOTIFICATION_TYPES: NotificationType[] = ['info', 'warning', 'success']
```

- [ ] **Step 6: Run it — expect PASS.**

Run: `pnpm test:int -- config-sanitize`
Expected: PASS (3 tests).

- [ ] **Step 7: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add package.json dev/payload.config.ts src/types.ts dev/config-sanitize.int.spec.ts
git commit -m "feat: package metadata + sanitized plugin config types"
```

---

### Task 2: Connection registry (interface + in-memory impl)

**Files:**
- Create: `src/registry/index.ts`
- Test: `dev/registry.int.spec.ts`

- [ ] **Step 1: Write the failing test** at `dev/registry.int.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { InMemoryRegistry } from '../src/registry/index.js'

const fakeController = () => ({ enqueue: vi.fn(), close: vi.fn() }) as unknown as ReadableStreamDefaultController

describe('InMemoryRegistry', () => {
  test('emitToUser delivers to every controller registered for that user', () => {
    const r = new InMemoryRegistry()
    const a = fakeController()
    const b = fakeController()
    r.register('u1', a)
    r.register('u1', b)
    r.emitToUser('u1', { hello: 'world' })
    expect((a.enqueue as any)).toHaveBeenCalledTimes(1)
    expect((b.enqueue as any)).toHaveBeenCalledTimes(1)
  })

  test('does not deliver to other users', () => {
    const r = new InMemoryRegistry()
    const a = fakeController()
    r.register('u1', a)
    r.emitToUser('u2', { x: 1 })
    expect((a.enqueue as any)).not.toHaveBeenCalled()
  })

  test('unregister stops delivery and prunes empty user sets', () => {
    const r = new InMemoryRegistry()
    const a = fakeController()
    r.register('u1', a)
    r.unregister('u1', a)
    r.emitToUser('u1', { x: 1 })
    expect((a.enqueue as any)).not.toHaveBeenCalled()
    expect(r.size()).toBe(0)
  })

  test('emitToUser to an unknown user is a no-op (no throw)', () => {
    const r = new InMemoryRegistry()
    expect(() => r.emitToUser('nobody', { x: 1 })).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- registry`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/registry/index.ts`:**

```ts
/**
 * Live-connection registry. In-memory now; a distributed implementation
 * (Postgres LISTEN/NOTIFY or Mongo change streams) can be dropped in behind
 * this same interface for multi-replica later. No Redis. See the design spec §7.
 */
export interface NotificationRegistry {
  register(userId: string, controller: ReadableStreamDefaultController): void
  unregister(userId: string, controller: ReadableStreamDefaultController): void
  emitToUser(userId: string, payload: unknown): void
}

export class InMemoryRegistry implements NotificationRegistry {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>()
  private encoder = new TextEncoder()

  register(userId: string, controller: ReadableStreamDefaultController): void {
    let set = this.connections.get(userId)
    if (!set) {
      set = new Set()
      this.connections.set(userId, set)
    }
    set.add(controller)
  }

  unregister(userId: string, controller: ReadableStreamDefaultController): void {
    const set = this.connections.get(userId)
    if (!set) return
    set.delete(controller)
    if (set.size === 0) this.connections.delete(userId)
  }

  emitToUser(userId: string, payload: unknown): void {
    const set = this.connections.get(userId)
    if (!set) return
    const chunk = this.encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
    for (const controller of set) {
      try {
        controller.enqueue(chunk)
      } catch {
        // controller already closed; drop it
        set.delete(controller)
      }
    }
    if (set.size === 0) this.connections.delete(userId)
  }

  /** Test/diagnostic helper: number of users with at least one live connection. */
  size(): number {
    return this.connections.size
  }
}

/** Process-wide singleton used by the endpoint + fan-out hook. */
export const notificationRegistry: NotificationRegistry & { size?(): number } = new InMemoryRegistry()
```

> Note: `emitToUser` encodes SSE wire format. The fan-out test (Task 4) asserts the hook calls `emitToUser` with the doc; the registry test asserts delivery mechanics. The `fakeController.enqueue` receives an encoded `Uint8Array` — that's fine for the call-count assertions above.

- [ ] **Step 4: Run it — expect PASS.**

Run: `pnpm test:int -- registry`
Expected: PASS (4 tests).

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/registry/index.ts dev/registry.int.spec.ts
git commit -m "feat: in-memory notification connection registry"
```

---

### Task 3: notifications collection factory

**Files:**
- Create: `src/collections/notifications.ts`
- Test: `dev/notifications-collection.int.spec.ts`

Consult the `payload` skill (ACCESS-CONTROL.md, FIELDS.md) before writing access functions and the select/relationship fields.

- [ ] **Step 1: Write the failing test** at `dev/notifications-collection.int.spec.ts`:

```ts
import type { Access } from 'payload'
import { describe, expect, test } from 'vitest'
import { createNotificationsCollection } from '../src/collections/notifications.js'
import { sanitizeConfig } from '../src/types.js'

const fieldNames = (c: ReturnType<typeof createNotificationsCollection>) =>
  c.fields.map((f) => ('name' in f ? f.name : undefined)).filter(Boolean)

describe('createNotificationsCollection', () => {
  test('single-tenant: core fields present, no tenant field, hidden from nav', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    expect(c.slug).toBe('notifications')
    expect(fieldNames(c)).toEqual(['recipient', 'message', 'link', 'type', 'read'])
    expect(c.admin?.hidden).toBe(true)
    expect(c.admin?.useAsTitle).toBe('message')
  })

  test('multi-tenant: adds a required tenant relationship field', () => {
    const c = createNotificationsCollection(sanitizeConfig({ tenants: {} }))
    const tenant = c.fields.find((f) => 'name' in f && f.name === 'tenant') as any
    expect(tenant).toBeDefined()
    expect(tenant.type).toBe('relationship')
    expect(tenant.relationTo).toBe('tenants')
    expect(tenant.required).toBe(true)
  })

  test('read access denies anonymous and scopes to recipient', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    const read = c.access!.read as Access
    expect(read({ req: { user: null } } as any)).toBe(false)
    expect(read({ req: { user: { id: 'u1' } } } as any)).toEqual({ recipient: { equals: 'u1' } })
  })

  test('read access ANDs a tenant filter in multi-tenant mode', () => {
    const c = createNotificationsCollection(sanitizeConfig({ tenants: {} }))
    const read = c.access!.read as Access
    const result = read({ req: { user: { id: 'u1', tenant: 't1' } } } as any)
    expect(result).toEqual({
      and: [{ recipient: { equals: 'u1' } }, { tenant: { equals: 't1' } }],
    })
  })

  test('create is denied via REST; update/delete scope to recipient', () => {
    const c = createNotificationsCollection(sanitizeConfig({}))
    expect((c.access!.create as Access)({ req: { user: { id: 'u1' } } } as any)).toBe(false)
    expect((c.access!.update as Access)({ req: { user: { id: 'u1' } } } as any)).toEqual({
      recipient: { equals: 'u1' },
    })
    expect((c.access!.delete as Access)({ req: { user: null } } as any)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- notifications-collection`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/collections/notifications.ts`:**

```ts
import type { Access, CollectionConfig, Where } from 'payload'
import type { SanitizedConfig } from '../types.js'
import { NOTIFICATION_TYPES } from '../types.js'

export const createNotificationsCollection = (config: SanitizedConfig): CollectionConfig => {
  const { notificationsSlug, usersSlug, tenants, hideFromNav } = config

  const recipientWhere = (userId: string | number): Where => ({ recipient: { equals: userId } })

  const read: Access = ({ req }) => {
    const user = req.user
    if (!user) return false
    const base = recipientWhere(user.id)
    if (tenants) {
      const tenantValue = (user as Record<string, unknown>)[tenants.tenantFieldName]
      return { and: [base, { [tenants.tenantFieldName]: { equals: tenantValue } }] }
    }
    return base
  }

  const ownRows: Access = ({ req }) => (req.user ? recipientWhere(req.user.id) : false)

  const collection: CollectionConfig = {
    slug: notificationsSlug,
    access: {
      read,
      create: () => false, // system-only; pushNotification() uses overrideAccess
      update: ownRows,
      delete: ownRows,
    },
    admin: {
      hidden: hideFromNav,
      useAsTitle: 'message',
      defaultColumns: ['message', 'type', 'read', 'createdAt'],
    },
    fields: [
      { name: 'recipient', type: 'relationship', relationTo: usersSlug, required: true, index: true },
      ...(tenants
        ? [
            {
              name: tenants.tenantFieldName,
              type: 'relationship' as const,
              relationTo: tenants.tenantsSlug,
              required: true,
              index: true,
            },
          ]
        : []),
      { name: 'message', type: 'text', required: true },
      { name: 'link', type: 'text' },
      {
        name: 'type',
        type: 'select',
        options: NOTIFICATION_TYPES.map((value) => ({ label: value, value })),
        defaultValue: 'info',
      },
      { name: 'read', type: 'checkbox', defaultValue: false, index: true },
    ],
    timestamps: true,
  }

  return collection
}
```

> Note: the multi-tenant test expects fields `['recipient', 'message', 'link', 'type', 'read']` in single-tenant mode and a `tenant` field inserted after `recipient` in multi-tenant mode. The implementation places `tenant` directly after `recipient` to match.
>
> **Reviewed caveat — multi-tenant user shape:** the read filter reads a single `req.user[tenantFieldName]`, i.e. it assumes a **one-tenant-per-user** model. The official `@payloadcms/plugin-multi-tenant` instead models users with a `tenants` *array* (multiple memberships). For those installs the simple `{ [tenantField]: { equals: user[tenantField] } }` filter won't be correct. v1 ships the simple model (documented); if you need the array model, the clean extension is an optional `tenantFilter?: (req) => Where` config hook that overrides the default filter. Add that option only if a real install needs it (YAGNI for v1) — but call it out in the README's multi-tenant section.

- [ ] **Step 4: Run it — expect PASS.**

Run: `pnpm test:int -- notifications-collection`
Expected: PASS (5 tests).

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/collections/notifications.ts dev/notifications-collection.int.spec.ts
git commit -m "feat: notifications collection factory with recipient/tenant access"
```

---

### Task 4: Fan-out hook

**Files:**
- Create: `src/hooks/fanout.ts`
- Test: `dev/fanout.int.spec.ts`

- [ ] **Step 1: Write the failing test** at `dev/fanout.int.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createFanoutHook } from '../src/hooks/fanout.js'
import type { NotificationRegistry } from '../src/registry/index.js'

const makeRegistry = () => {
  const emitToUser = vi.fn()
  const registry: NotificationRegistry = { register: vi.fn(), unregister: vi.fn(), emitToUser }
  return { registry, emitToUser }
}

describe('createFanoutHook', () => {
  test('on create, emits the doc to the recipient id (relationship as id)', async () => {
    const { registry, emitToUser } = makeRegistry()
    const hook = createFanoutHook(registry)
    const doc = { id: 'n1', recipient: 'u1', message: 'hi', type: 'info', read: false }
    await hook({ doc, operation: 'create' } as any)
    expect(emitToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'n1', message: 'hi' }))
  })

  test('resolves recipient when populated as an object', async () => {
    const { registry, emitToUser } = makeRegistry()
    const hook = createFanoutHook(registry)
    const doc = { id: 'n2', recipient: { id: 'u2' }, message: 'hey' }
    await hook({ doc, operation: 'create' } as any)
    expect(emitToUser).toHaveBeenCalledWith('u2', expect.objectContaining({ id: 'n2' }))
  })

  test('does not emit on update', async () => {
    const { registry, emitToUser } = makeRegistry()
    const hook = createFanoutHook(registry)
    await hook({ doc: { id: 'n3', recipient: 'u1' }, operation: 'update' } as any)
    expect(emitToUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- fanout`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/fanout.ts`:**

```ts
import type { CollectionAfterChangeHook } from 'payload'
import type { NotificationRegistry } from '../registry/index.js'

/** Resolve a relationship value that may be an id (opaque) or a populated doc. */
const toId = (rel: unknown): string => {
  if (rel && typeof rel === 'object' && 'id' in rel) return String((rel as { id: unknown }).id)
  return String(rel)
}

/**
 * The single live-push fan-out point: on create of a notification row, emit the
 * doc to the recipient's open SSE connections. Best-effort — never throws into
 * the write path.
 */
export const createFanoutHook =
  (registry: NotificationRegistry): CollectionAfterChangeHook =>
  ({ doc, operation }) => {
    if (operation !== 'create') return doc
    try {
      registry.emitToUser(toId(doc.recipient), doc)
    } catch {
      // best-effort live push; the DB row is the source of truth
    }
    return doc
  }
```

- [ ] **Step 4: Run it — expect PASS.**

Run: `pnpm test:int -- fanout`
Expected: PASS (3 tests).

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/hooks/fanout.ts dev/fanout.int.spec.ts
git commit -m "feat: afterChange fan-out hook emits new notifications over SSE"
```

---

### Task 5: SSE stream endpoint

**Files:**
- Create: `src/endpoints/stream.ts`
- Test: `dev/stream-endpoint.int.spec.ts`

Consult the `payload` skill (ENDPOINTS.md) — collection endpoint handler receives a `PayloadRequest` with `req.user` pre-authed; returns a Web `Response`.

- [ ] **Step 1: Write the failing test** at `dev/stream-endpoint.int.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createStreamEndpoint } from '../src/endpoints/stream.js'
import type { NotificationRegistry } from '../src/registry/index.js'

const makeRegistry = () => {
  const calls = { register: vi.fn(), unregister: vi.fn(), emitToUser: vi.fn() }
  return { registry: calls as unknown as NotificationRegistry, calls }
}

describe('createStreamEndpoint', () => {
  test('mounts GET /stream', () => {
    const { registry } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    expect(ep.path).toBe('/stream')
    expect(ep.method).toBe('get')
  })

  test('401 when unauthenticated', async () => {
    const { registry, calls } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    const res = await ep.handler({ user: null, signal: new AbortController().signal } as any)
    expect(res.status).toBe(401)
    expect(calls.register).not.toHaveBeenCalled()
  })

  test('authed: returns an event-stream and registers the connection', async () => {
    const { registry, calls } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    const res = await ep.handler({ user: { id: 'u1' }, signal: new AbortController().signal } as any)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(calls.register).toHaveBeenCalledWith('u1', expect.anything())
  })

  test('unregisters on abort', async () => {
    const { registry, calls } = makeRegistry()
    const controller = new AbortController()
    const ep = createStreamEndpoint(registry)
    await ep.handler({ user: { id: 'u1' }, signal: controller.signal } as any)
    controller.abort()
    expect(calls.unregister).toHaveBeenCalledWith('u1', expect.anything())
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- stream-endpoint`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/endpoints/stream.ts`:**

```ts
import type { Endpoint, PayloadRequest } from 'payload'
import type { NotificationRegistry } from '../registry/index.js'

/**
 * SSE stream as a collection endpoint -> /api/<notificationsSlug>/stream.
 * req.user is pre-authed by Payload (cookie). Returns the streaming Response
 * immediately; registers the controller and cleans up on client disconnect.
 */
export const createStreamEndpoint = (registry: NotificationRegistry): Endpoint => ({
  path: '/stream',
  method: 'get',
  handler: (req: PayloadRequest) => {
    const user = req.user
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userId = String(user.id)
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController | undefined
    let onAbort: (() => void) | undefined

    // Single cleanup using the CAPTURED controller reference (not `this`).
    const cleanup = () => {
      if (streamController) registry.unregister(userId, streamController)
      if (onAbort) req.signal?.removeEventListener('abort', onAbort)
    }

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller
        registry.register(userId, controller)
        // initial comment to open the stream and defeat proxy buffering
        controller.enqueue(encoder.encode(': connected\n\n'))

        onAbort = () => {
          cleanup()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
        req.signal?.addEventListener('abort', onAbort)
      },
      cancel() {
        cleanup()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  },
})
```

> **Cleanup design (reviewed):** `cancel()` is the *primary, reliable* cleanup — it fires whenever the Response stream is torn down (consumer disconnect), on every platform. The `req.signal` abort listener is *secondary* and may be absent on `PayloadRequest` (the Phase-0 spike Step 4 confirms which fires); both route through `cleanup()`, which unregisters the **closure-captured `controller`** — not `this`, which is NOT the controller inside the source object. The Task-5 test asserts `unregister(userId, <controller>)` is called on abort.
>
> **If the Phase-0 spike chose Approach B:** also export `createStreamRoute(getConfig)` here returning a Next.js `GET` handler that calls `payload.auth({ headers: req.headers })`, returns the same `Response` immediately, and the dev app mounts it at `dev/app/(payload)/api/notifications/stream/route.ts` with `export const runtime = 'nodejs'`. Keep `createStreamEndpoint` too; the plugin (Task 6) wires whichever the spike picked.

- [ ] **Step 4: Run it — expect PASS.**

Run: `pnpm test:int -- stream-endpoint`
Expected: PASS (4 tests).

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/endpoints/stream.ts dev/stream-endpoint.int.spec.ts
git commit -m "feat: SSE stream collection endpoint with auth + abort cleanup"
```

---

### Task 6: pushNotification public API

**Files:**
- Create: `src/pushNotification.ts`
- Test: `dev/push-notification.int.spec.ts` (boots Payload — uses the in-memory Mongo)

- [ ] **Step 1: Write the failing test** at `dev/push-notification.int.spec.ts`:

```ts
import type { Payload } from 'payload'
import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { pushNotification } from '../src/pushNotification.js'

let payload: Payload
let userId: string

beforeAll(async () => {
  payload = await getPayload({ config })
  const user = await payload.create({
    collection: 'users',
    data: { email: `recip-${Date.now()}@test.com`, password: 'test1234' },
  })
  userId = String(user.id)
})

afterAll(async () => {
  await payload.destroy()
})

describe('pushNotification', () => {
  test('creates a notification row for the recipient', async () => {
    const doc = await pushNotification(payload, {
      recipient: userId,
      message: 'Invoice paid',
      link: '/admin/collections/invoices/1',
      type: 'success',
    })
    expect(doc.id).toBeDefined()
    expect(doc.message).toBe('Invoice paid')
    expect(doc.type).toBe('success')
    expect(doc.read).toBe(false)

    const found = await payload.findByID({ collection: 'notifications', id: doc.id })
    expect(String(found.recipient)).toBe(userId)
  })

  test('defaults type to info', async () => {
    const doc = await pushNotification(payload, { recipient: userId, message: 'plain' })
    expect(doc.type).toBe('info')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- push-notification`
Expected: FAIL — module not found (and `notifications` collection not yet wired into the dev config; Task 7 wires it, but `pushNotification` module itself is the immediate failure).

- [ ] **Step 3: Implement `src/pushNotification.ts`:**

```ts
import type { Payload, PayloadRequest } from 'payload'
import type { NotificationType } from './types.js'

export interface PushNotificationArgs {
  recipient: string | number
  message: string
  link?: string
  /** @default 'info' */
  type?: NotificationType
  /** Required when multi-tenant is configured (unless auto-assigned). */
  tenant?: string | number
  /** Pass when calling from inside a hook so the create joins the same transaction. */
  req?: PayloadRequest
  /** Override the collection slug if customized in plugin config. @default 'notifications' */
  notificationsSlug?: string
}

/**
 * Public write API. Creates a notification row; the collection's afterChange
 * fan-out hook performs the best-effort SSE push as a side effect. Future:
 * swap this create for payload.jobs.queue() for async/digest notifications.
 */
export const pushNotification = async (
  payload: Payload,
  { recipient, message, link, type = 'info', tenant, req, notificationsSlug = 'notifications' }: PushNotificationArgs,
) =>
  payload.create({
    collection: notificationsSlug,
    data: { recipient, message, link, type, ...(tenant !== undefined ? { tenant } : {}) },
    overrideAccess: true,
    req,
  })
```

> Note: `pushNotification` runs `overrideAccess: true` (system write). The `notifications` collection's `create` access is `false` for REST callers — only this path (and admins via overrideAccess) can write.

- [ ] **Step 4: Run it — expect PASS** (requires Task 7's dev wiring; if running strictly in order, the collection won't exist yet — so implement Task 7's dev-config wiring step BEFORE this test passes, or temporarily add the plugin to the dev config now). To keep tasks independent, wire the plugin into the dev config as the first step of Task 7, then this test passes. If you prefer strict order, mark this test `.todo` until Task 7, then flip it.

Run: `pnpm test:int -- push-notification`
Expected (after Task 7 wiring): PASS (2 tests).

- [ ] **Step 5: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int -- push-notification
git add src/pushNotification.ts dev/push-notification.int.spec.ts
git commit -m "feat: pushNotification public write API"
```

---

### Task 7: Plugin assembly + dev wiring

**Files:**
- Modify: `src/index.ts`
- Modify: `dev/payload.config.ts`
- Test: `dev/plugin-assembly.int.spec.ts`

Consult the `payload` skill (PLUGIN-DEVELOPMENT.md) — preserve existing config arrays; honor `disabled`; push to `admin.components.actions`.

- [ ] **Step 1: Write the failing test** at `dev/plugin-assembly.int.spec.ts` (pure — operates on a fake incoming config):

```ts
import type { Config } from 'payload'
import { describe, expect, test } from 'vitest'
import { payloadPluginNotifications } from '../src/index.js'

const base = (): Config => ({ collections: [], admin: {} }) as unknown as Config

describe('payloadPluginNotifications', () => {
  test('adds the notifications collection (with /stream endpoint + fan-out hook)', () => {
    const out = payloadPluginNotifications({})(base())
    const col = out.collections!.find((c) => c.slug === 'notifications')!
    expect(col).toBeDefined()
    expect(col.endpoints).toEqual([expect.objectContaining({ path: '/stream', method: 'get' })])
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
      collections: [{ slug: 'posts', fields: [] }],
      admin: { components: { actions: ['existing#Action'] } },
    } as unknown as Config
    const out = payloadPluginNotifications({})(incoming)
    expect(out.collections!.find((c) => c.slug === 'posts')).toBeDefined()
    expect(out.admin!.components!.actions).toContain('existing#Action')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `pnpm test:int -- plugin-assembly`
Expected: FAIL — `src/index.ts` is still the no-op stub.

- [ ] **Step 3: Implement `src/index.ts`:**

```ts
import type { Config, Plugin } from 'payload'
import type { NotificationsPluginConfig } from './types.js'
import { sanitizeConfig } from './types.js'
import { createNotificationsCollection } from './collections/notifications.js'
import { createFanoutHook } from './hooks/fanout.js'
import { createStreamEndpoint } from './endpoints/stream.js'
import { notificationRegistry } from './registry/index.js'

export const payloadPluginNotifications =
  (pluginOptions: NotificationsPluginConfig = {}): Plugin =>
  (config: Config): Config => {
    const sanitized = sanitizeConfig(pluginOptions)

    const collection = createNotificationsCollection(sanitized)

    // Always add the collection so the DB schema stays stable (disabled or not).
    if (!config.collections) config.collections = []

    if (!sanitized.disabled) {
      collection.endpoints = [
        ...(collection.endpoints || []),
        createStreamEndpoint(notificationRegistry),
      ]
      collection.hooks = {
        ...collection.hooks,
        afterChange: [createFanoutHook(notificationRegistry), ...(collection.hooks?.afterChange || [])],
      }
    }

    config.collections.push(collection)

    if (sanitized.disabled) return config

    if (!config.admin) config.admin = {}
    if (!config.admin.components) config.admin.components = {}
    if (!config.admin.components.actions) config.admin.components.actions = []
    config.admin.components.actions.push(
      '@elghaied/payload-plugin-notifications/client#NotificationBell',
    )

    return config
  }

export type { NotificationsPluginConfig, TenantsConfig, NotificationType } from './types.js'
export { pushNotification } from './pushNotification.js'
export type { PushNotificationArgs } from './pushNotification.js'
export { notificationRegistry } from './registry/index.js'
export type { NotificationRegistry } from './registry/index.js'
```

- [ ] **Step 4: Wire the plugin into the dev config.** In `dev/payload.config.ts` set `plugins: [payloadPluginNotifications({})]` (the import was renamed in Task 1). Confirm the import specifier is `@elghaied/payload-plugin-notifications`.

- [ ] **Step 5: Run it — expect PASS**, and the previously-pending Task 6 test now passes too.

Run: `pnpm test:int -- plugin-assembly push-notification`
Expected: PASS.

- [ ] **Step 6: Regenerate types + import map** (schema + component changed; use the reaping wrapper):

```bash
pnpm dev:generate-types && pnpm dev:generate-importmap
```

- [ ] **Step 7: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/index.ts dev/payload.config.ts dev/payload-types.ts 'dev/app/(payload)/admin/importMap.js' dev/plugin-assembly.int.spec.ts
git commit -m "feat: assemble plugin (collection, stream endpoint, fan-out, bell injection)"
```

---

### Task 8: End-to-end access isolation (integration)

**Files:**
- Test: `dev/access-isolation.int.spec.ts`

Proves the recipient scoping works through real access control, not just the unit-level `where` shape.

- [ ] **Step 1: Write the failing test** at `dev/access-isolation.int.spec.ts`:

```ts
import type { Payload } from 'payload'
import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { pushNotification } from '../src/pushNotification.js'

let payload: Payload
let alice: any
let bob: any

beforeAll(async () => {
  payload = await getPayload({ config })
  alice = await payload.create({ collection: 'users', data: { email: `alice-${Date.now()}@t.com`, password: 'test1234' } })
  bob = await payload.create({ collection: 'users', data: { email: `bob-${Date.now()}@t.com`, password: 'test1234' } })
  await pushNotification(payload, { recipient: alice.id, message: 'for alice' })
  await pushNotification(payload, { recipient: bob.id, message: 'for bob' })
})

afterAll(async () => {
  await payload.destroy()
})

describe('recipient access isolation', () => {
  test('alice sees only her notification under enforced access', async () => {
    const { docs } = await payload.find({
      collection: 'notifications',
      user: alice,
      overrideAccess: false,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0].message).toBe('for alice')
  })

  test('REST create is denied even for an authenticated user', async () => {
    await expect(
      payload.create({
        collection: 'notifications',
        data: { recipient: bob.id, message: 'forged' },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  test('a user can mark their own notification read', async () => {
    const { docs } = await payload.find({ collection: 'notifications', user: bob, overrideAccess: false })
    const updated = await payload.update({
      collection: 'notifications',
      id: docs[0].id,
      data: { read: true },
      user: bob,
      overrideAccess: false,
    })
    expect(updated.read).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL first** (write the test, confirm it fails if, e.g., access were misconfigured). If it passes immediately because Task 3/7 already implemented access correctly, that's acceptable here — this is a regression/contract test over already-built behavior; note in the commit that it codifies the isolation contract. To see a real red, temporarily loosen `create` to `() => true` and watch the create-denied test fail, then restore.

Run: `pnpm test:int -- access-isolation`
Expected: PASS (3 tests) with correct access; the deliberate loosening proves the test bites.

- [ ] **Step 3: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add dev/access-isolation.int.spec.ts
git commit -m "test: end-to-end recipient access isolation"
```

---

### Task 9: Theme indirection CSS + NotificationBell component (ADMIN COMPONENT — visual gate)

**Files:**
- Create: `src/theme/notifications.css`
- Create: `src/components/NotificationBell.tsx`
- Modify: `src/exports/client.ts`
- Test: `dev/bell-exports.int.spec.ts` (import/shape smoke) + **manual browser verification**

Consult the `payload` skill + `@payloadcms/ui` for the exact public exports (`Popup`, `Pill`, `toast`/`useToast`) and import names before writing the component. **Theme rule:** all Payload theme references go through `notifications.css`; declare variables at `:root` so the portal-rendered `Popup`/toast (mounted at `<body>`) can read them.

- [ ] **Step 1: Create `src/theme/notifications.css`** — the single indirection file (maps Payload theme tokens to plugin-local vars at `:root` so portal UI can reach them):

```css
:root {
  --pn-bg: var(--theme-elevation-0, #1b1b1f);
  --pn-bg-hover: var(--theme-elevation-50, #23232b);
  --pn-border: var(--theme-elevation-150, #34343d);
  --pn-text: var(--theme-elevation-800, #e3e3e6);
  --pn-text-muted: var(--theme-elevation-500, #9a9aa6);
  --pn-accent: var(--theme-success-500, #22c55e);
  --pn-info: var(--theme-text-info, #60a5fa);
  --pn-warning: var(--theme-warning-500, #f59e0b);
  --pn-success: var(--theme-success-500, #22c55e);
  --pn-badge-bg: var(--theme-success-500, #3b82f6);
}

.pn-panel {
  width: 340px;
  max-width: 90vw;
  background: var(--pn-bg);
  color: var(--pn-text);
  border: 1px solid var(--pn-border);
  border-radius: 8px;
  overflow: hidden;
}
.pn-item { display: flex; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--pn-border); cursor: pointer; }
.pn-item:hover { background: var(--pn-bg-hover); }
.pn-item--read { opacity: 0.62; }
.pn-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; }
.pn-dot--info { background: var(--pn-info); }
.pn-dot--warning { background: var(--pn-warning); }
.pn-dot--success { background: var(--pn-success); }
.pn-meta { font-size: 11px; color: var(--pn-text-muted); margin-top: 3px; }
```

- [ ] **Step 2: Write a shape smoke test** at `dev/bell-exports.int.spec.ts`:

```ts
import { describe, expect, test } from 'vitest'
import * as client from '../src/exports/client.js'

describe('client exports', () => {
  test('NotificationBell is exported', () => {
    expect(client.NotificationBell).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it — expect FAIL.**

Run: `pnpm test:int -- bell-exports`
Expected: FAIL — `NotificationBell` not exported.

- [ ] **Step 4: Implement `src/components/NotificationBell.tsx`.** Imports **confirmed against `@payloadcms/ui@3.84.1`**: `Popup`, `Pill`, `toast`, `useConfig` all export from `@payloadcms/ui`. `Popup` takes `button` (trigger node) + `render={({ close }) => …}` (content, **rendered in a portal** — hence the `:root` theme-var rule). `toast` is re-exported from **sonner**, so `toast.info(message)` is valid and the admin already mounts the Toaster (no `<Toaster />` needed):

```tsx
'use client'
import { Popup, Pill, toast, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import './../theme/notifications.css'

type Notification = {
  id: string
  message: string
  link?: string
  type?: 'info' | 'warning' | 'success'
  read?: boolean
}

export const NotificationBell = () => {
  const { config } = useConfig()
  const apiRoute = config.routes.api // e.g. '/api'
  const [items, setItems] = useState<Notification[]>([])
  const esRef = useRef<EventSource | null>(null)

  const unread = items.filter((n) => !n.read).length

  const fetchUnread = useCallback(async () => {
    const res = await fetch(`${apiRoute}/notifications?where[read][equals]=false&sort=-createdAt&limit=20`, {
      credentials: 'include',
    })
    if (!res.ok) return
    const data = await res.json()
    setItems(data.docs ?? [])
  }, [apiRoute])

  useEffect(() => {
    fetchUnread()
    const es = new EventSource(`${apiRoute}/notifications/stream`, { withCredentials: true })
    es.onmessage = (e) => {
      try {
        const doc = JSON.parse(e.data) as Notification
        setItems((prev) => [doc, ...prev])
        toast.info(doc.message)
      } catch {
        /* ignore keep-alive comments */
      }
    }
    es.onerror = () => { /* graceful degrade: rely on fetchUnread on open */ }
    esRef.current = es
    return () => es.close()
  }, [apiRoute, fetchUnread])

  const markRead = async (n: Notification) => {
    await fetch(`${apiRoute}/notifications/${n.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    if (n.link) window.location.href = n.link
  }

  return (
    <Popup
      button={
        <span style={{ position: 'relative', display: 'inline-flex' }} aria-label="Notifications">
          🔔
          {unread > 0 && <Pill>{unread}</Pill>}
        </span>
      }
      render={() => (
        <div className="pn-panel" onClick={fetchUnread}>
          {items.length === 0 && <div className="pn-item">No notifications</div>}
          {items.map((n) => (
            <div
              key={n.id}
              className={`pn-item${n.read ? ' pn-item--read' : ''}`}
              onClick={() => markRead(n)}
            >
              <span className={`pn-dot pn-dot--${n.type ?? 'info'}`} />
              <div style={{ flex: 1 }}>
                <div>{n.message}</div>
                {n.link && <div className="pn-meta">{n.link}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      showScrollbar
    />
  )
}
```

> Prop API confirmed against `@payloadcms/ui@3.84.1` (`Popup.button` + `Popup.render`, `showScrollbar`). Keep the contract intact: icon + Pill badge, panel list, click→markRead→navigate, toast on live arrival. If `Pill`'s child/label prop differs at runtime, adjust the badge JSX only.

- [ ] **Step 5: Export it** — `src/exports/client.ts`:

```ts
export { NotificationBell } from '../components/NotificationBell.js'
```

- [ ] **Step 6: Run the smoke test — expect PASS.**

Run: `pnpm test:int -- bell-exports`
Expected: PASS.

- [ ] **Step 7: Regenerate import map** (new component):

```bash
pnpm dev:generate-importmap
```

- [ ] **Step 8: VISUAL GATE — look at it rendered.** Boot a real prod build and verify in a browser:

```bash
pnpm build && pnpm start   # background; serves /admin on :3000
```
Then (login first if needed) verify the **specific claims**, not just that the page loads:
  1. The bell appears in the admin top-bar actions.
  2. Seed a notification live and confirm the **badge increments + a toast pops WITHOUT a page refresh**:
     `node -e "import('@payload-config').then(async ({default:c})=>{const {getPayload}=await import('payload');const p=await getPayload({config:await c});const u=(await p.find({collection:'users',limit:1})).docs[0];const {pushNotification}=await import('./src/pushNotification.ts');await pushNotification(p,{recipient:u.id,message:'live ping',type:'success'});process.exit(0)})"`
     (or trigger via any path that calls `pushNotification`).
  3. Open the dropdown — confirm the **portal-rendered `Popup` has correct theming** (background/border/text via the CSS vars, readable in both light and dark theme). This is the portal gotcha: if the panel renders unstyled/transparent, the vars aren't reaching `<body>` — fix by ensuring they're declared at `:root`.
  4. Click a notification → navigates to its `link` and the item shows read.
  Capture a screenshot (chrome-devtools / playwright MCP) as evidence.

- [ ] **Step 9: Gate + commit.**

```bash
pnpm lint && npx tsc --noEmit && pnpm test:int
git add src/theme/notifications.css src/components/NotificationBell.tsx src/exports/client.ts 'dev/app/(payload)/admin/importMap.js' dev/bell-exports.int.spec.ts
git commit -m "feat: NotificationBell admin component + theme indirection"
```

---

## Phase 3 — Verify (Payload checklist)

### Task 10: Full verification pass

- [ ] **Step 1: Regenerate** types + import map (in case anything drifted):

```bash
pnpm dev:generate-types && pnpm dev:generate-importmap
```

- [ ] **Step 2: Static gates.**

```bash
npx tsc --noEmit && pnpm lint
```
Expected: both clean (including `dev/` test files).

- [ ] **Step 3: Full integration suite.**

```bash
pnpm test:int
```
Expected: all specs green.

- [ ] **Step 4: Production-parity build + serve.**

```bash
pnpm build && pnpm start
```
Expected: dist builds; `/admin` serves HTTP 200; the bell works on the **prod build** (not just `dev`). Re-confirm the live-push + portal-theme claims from Task 9 Step 8 here on the prod build, with a screenshot.

- [ ] **Step 5: Stop the server**, confirm no orphan processes (`pgrep -fa next || echo clean`).

---

## Phase 4 — Capture

### Task 11: Docs, changeset, CLAUDE.md

- [ ] **Step 1: Update `CLAUDE.md`** — fill the Architecture + Configuration sections: the two-layer design, the file map, the SSE-transport decision from the spike, each config option (`disabled`, `notificationsSlug`, `usersSlug`, `tenants`, `hideFromNav`), and the `pushNotification` usage example.

- [ ] **Step 2: Write `README.md`** — install, quick start (`plugins: [payloadPluginNotifications({})]`), the `pushNotification` example, multi-tenant config, the live-bell requirement (long-running process for SSE; graceful degrade otherwise), and the documented extension points (jobs-queue seam, distributed registry).

- [ ] **Step 3: Add one changeset** (additive → minor):

```bash
pnpm changeset   # choose minor; summary: "Add in-app notifications with a live SSE bell"
```
(If `@changesets/cli` isn't installed, add it: `pnpm add -D @changesets/cli && pnpm changeset init`, then create the changeset.)

- [ ] **Step 4: Final commit.**

```bash
git add CLAUDE.md README.md .changeset
git commit -m "docs: README, CLAUDE.md architecture, and changeset for notifications"
```

- [ ] **Step 5: Finish the branch** — use `superpowers:finishing-a-development-branch` to choose merge/PR/cleanup for `feat/notifications-plugin`.

---

## Self-Review (author checklist — completed)

**Spec coverage:** §2 architecture → Tasks 3–7; §3 collection → Task 3; §4 access → Tasks 3, 8; §5 pushNotification → Task 6; §6 SSE transport → Task 0 (decision) + Task 5; §7 registry → Task 2; §8 UI + theme → Task 9; §9 config → Task 1; §10 file layout → File Structure; §11 phases/gates → Phase 0/2/3/4 + per-task gates; §13 acceptance criteria → AC1 Task 7, AC2 Task 8, AC3 Tasks 5/6/9, AC4 Task 9, AC5 Task 9 visual gate, AC6 Task 10/11. No gaps.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. The one remaining deliberate deferral — the Approach-B branch (Task 0/5) — is gated on the Phase-0 spike. (`@payloadcms/ui` imports, the global `admin.components.actions` slot, and the auto-injected `users` collection were all *verified* during plan review — see the Plan Review note below.)

## Plan Review (payload-skill verification, 2026-06-07)

Reviewed the plan's Payload-specific claims against the `payload` skill, the Payload v3.84.0 docs (context7), the installed packages, and the live harness:

- ✅ **`admin.components.actions` is a valid root-level slot** rendering components in the Admin Panel header (v3.84.0 `root-components` docs). Bell mounting correct.
- ✅ **`users` collection is auto-injected** by Payload 3.84 (probed the booted dev config: `users` present alongside `payload-kv`/`payload-locked-documents`/`payload-preferences`/`payload-migrations`). Tasks 6 & 8 are safe.
- ✅ **`@payloadcms/ui@3.84.1` exports `Popup`, `Pill`, `toast` (from sonner), `useConfig`.** `Popup` uses `button` + `render({ close })`; content renders in a portal (validates the `:root` theme-var rule). `toast.info()` valid.
- 🐛 **Fixed:** Task 5 `cancel()` referenced `this` instead of the registered controller → connection leak on disconnect. Now uses a closure-captured `controller` via a shared `cleanup()`.
- ⚠️ **Flagged:** multi-tenant read filter assumes one-tenant-per-user (see Task 3 caveat); the official multi-tenant plugin uses a `tenants` array. Documented; optional `tenantFilter` hook is the future extension.

**Type consistency:** `SanitizedConfig`/`sanitizeConfig` (Task 1) consumed by Tasks 3, 7. `NotificationRegistry` (Task 2) consumed by Tasks 4, 5, 7. `createNotificationsCollection`/`createFanoutHook`/`createStreamEndpoint`/`pushNotification`/`notificationRegistry` names are identical across definition and use. Component path string `@elghaied/payload-plugin-notifications/client#NotificationBell` matches the renamed package (Task 1) and the export (Task 9).
