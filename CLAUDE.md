# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file tight and skimmable —
it loads into context every session, so bloat costs you.

> Seed file. It **grows**: each completed phase (WORKFLOW, Phase 4) feeds proven patterns back
> into the relevant section below. The rich version is the *output* of running the workflow.

---

## What this is

<!-- One paragraph: what the plugin does, which collections/hooks/endpoints/components it adds. -->

`@elghaied/payload-plugin-notifications` — in-dashboard notifications for the Payload admin with
a **live SSE bell**. Two decoupled layers: the **source of truth** is a `notifications` collection
row (adapter-agnostic, opaque ids); the **live channel** is a best-effort Server-Sent-Events push
to open admin tabs, triggered as a side effect of the DB write by a single `afterChange` fan-out
hook. Adds: the `notifications` collection (recipient-scoped access, hidden from nav), a `/stream`
collection endpoint, the fan-out hook, a `pushNotification()` write API, and a `NotificationBell`
client component injected into `admin.components.actions`. Additive and **default-off** via
`disabled`; multi-tenant is **optional** via the `tenants` config.

---

## Process & rules (pointers — these files are not auto-loaded without this)

- **Building anything?** Follow the phased process in the **payload-plugin-workflow** skill
  (research → plan → per phase: spec → code → tests → verify → capture).
- **Invariants that hold at every step:** the skill's `RULES.md` (MUST/NEVER + done-gate).
- **Payload API/conventions:** use the official **`payload`** skill before writing Payload
  code and when revising specs. Load it alongside the workflow skill.

Keep process in the workflow skill, invariants in RULES, and facts about the code here.

---

## Hard rules (non-negotiable)

1. **V4 compatibility is a primary constraint.** Avoid coupling to anything likely to break
   across a Payload major version.
2. **All theme references go through a single CSS-variables indirection file.** Never reference
   Payload's internal SCSS variables or class names directly anywhere else. Most important rule.
   Declare the variables where **portal-rendered UI** (Modal/Drawer/tooltips render in a portal
   at `<body>`, outside the field wrapper) can reach them — the portal element or `:root`.
3. **Green automated gates don't prove an admin component works.** Any admin-component change
   must be **looked at rendered** in a browser (the specific visual claim), not just "it built /
   the page loaded". A `test.skip`'d e2e does not count as verified.
4. **Type safety is mandatory.** Use Payload's generated types and Zod for runtime validation.
   No invented field names or assumed API shapes. `tsc --noEmit` is the authoritative type gate.
5. **Verify with `pnpm build && pnpm start`, not just `pnpm dev`.** Behavior diverges.
6. **Tests verify intent, not implementation.** Criteria come from the spec, before code. The
   code under test does not author the tests that judge it.
7. **Diagnosis is not a fix.** When asked "what's the issue?", diagnose and stop — don't
   auto-commit a fix. Reproduced evidence outranks an unverified claim.
8. **Setup/config stays in the Payload admin** (CRUD-heavy, one-time). Defer custom dashboards.

---

## Conventions

- **ESM throughout** (`"type": "module"`); `.js` extensions in import paths even for `.ts`.
- **Factory pattern:** `createXxxCollection(config)`, `createXxxEndpoint(config)`; plugin shape
  `(opts) => (config) => modifiedConfig`.
- **Layers:** `collections/`, `hooks/`, `services/` (pure + DB split), `utilities/` (pure),
  `endpoints/`, `components/` (client/rsc), `translations/`.
- **Hook guard:** every hook starts with its skip/escape-hatch guard; after-hooks firing plugin
  hooks wrap in try-catch (log, don't throw).
- **Prettier:** single quotes, no semicolons, trailing commas, 100-char width. **TS strict.**
- Object keys alphabetical if the linter enforces it (`perfectionist`).
- **Commits:** conventional, scoped. **One changeset per feature** (additive→minor, fix→patch,
  breaking→major).
- **Peer deps** (`payload`, `@payloadcms/ui`, `@payloadcms/translations`) stay in
  `peerDependencies` + `devDependencies`, never runtime deps.
- **Ids opaque.** This plugin targets Mongo (ids are `string` ObjectIDs); never parse/assume an
  id's type, so another adapter could be added without touching fields/handlers.

---

## Commands

<!-- Confirm against this project's package.json. -->

```bash
pnpm dev                      # dev server (boots in-memory Mongo via PAYLOAD_MEMORY_DB)
pnpm start                    # build + start (also self-contained on in-memory Mongo)
pnpm build                    # copyfiles -> types (tsc) -> SWC to dist/
pnpm test:int                 # integration (vitest) — self-contained in-memory Mongo (VITEST)
pnpm test:e2e                 # e2e (playwright)
pnpm lint / lint:fix          # run lint (covers dev/) in EVERY task gate, not just at the end
pnpm dev:generate-types       # after collection/field changes (routed through payload-cli.mjs)
pnpm dev:generate-importmap   # after adding admin components (routed through payload-cli.mjs)
pnpm changeset
```

**Local harness (Mongo-only, self-contained):** `dev/payload.config.ts` uses a single
`mongooseAdapter`. `pnpm dev`, `pnpm start`, and the test runner spin up an in-memory
`MongoMemoryReplSet` (no Docker) — gated on `PAYLOAD_MEMORY_DB` (set by dev/start) or `VITEST`,
so one-shot CLI commands (`generate:types`, `generate:importmap`) never spawn an untracked
mongod that pins the CPU. Those run through `dev/payload-cli.mjs`, which reaps the CLI's
CPU-spinning orphan. Set `DATABASE_URI` to point at a real Mongo instead.

**CPU-orphan trap (fixed — do not regress):** Payload fire-and-forgets a `generate:types` /
`generate:importmap` **child process on every non-production init** (`getPayload`), and that child
inherits the parent's env — so under `pnpm test:int` each `getPayload` spawns a `generate:types`
that inherits `VITEST=true`, boots its OWN memory replset, spins, and is never reaped (it reparents
to init). Dozens of test runs ⇒ dozens of CPU-pinning orphans. Two guards prevent this, both in
`dev/payload.config.ts`: (1) `typescript.autoGenerate: false` + `admin.importMap.autoGenerate:
false` stop the on-init fire-and-forget entirely (regen explicitly via `pnpm dev:generate-types`);
(2) `wantsMemoryDB` excludes `generate:*` argv so a generate CLI never boots the memory DB even
with `VITEST` inherited. A tighter `NODE_ENV==='test' && VITEST` gate would NOT fix it — the
orphan children carry both flags. If `test:int` ever slows down or `ps | grep "bin.js
generate:types"` shows lingering procs, these guards regressed.

---

## Architecture

Two decoupled layers; the live push is always a side effect of the DB write, never a separate path.

| File | Responsibility |
|---|---|
| `src/index.ts` | Plugin entry `payloadPluginNotifications(opts)(config)`. Adds the collection (always, schema-stable); wires the `/stream` endpoint + fan-out hook + bell only when not `disabled`. |
| `src/types.ts` | `NotificationsPluginConfig` + `sanitizeConfig()` → `SanitizedConfig`; `NOTIFICATION_TYPES`. |
| `src/collections/notifications.ts` | `createNotificationsCollection(sanitized)`. Fields: `recipient`, (optional `tenant`), `message`, `link`, `type`, `read`. Access: read = recipient-scoped (+ tenant AND when multi-tenant); create = `false` (system-only); update/delete = own rows. Hidden from nav by default. |
| `src/registry/index.ts` | `NotificationRegistry` interface + `InMemoryRegistry` + `notificationRegistry` singleton. `Map<userId, Set<controller>>`. Distributed impl (PG LISTEN/NOTIFY / Mongo change streams) is a documented future swap, not built. |
| `src/hooks/fanout.ts` | `createFanoutHook(registry)` — `afterChange`; on `create`, `registry.emitToUser(recipientId, doc)`. Best-effort (never throws into the write path). |
| `src/endpoints/stream.ts` | `createStreamEndpoint(registry)` → `/api/<slug>/stream`. 401 if no `req.user`; else streaming `text/event-stream` Response; registers the closure-captured controller; cleanup via `cancel()` + `req.signal` abort. |
| `src/pushNotification.ts` | `pushNotification(payload, { recipient, message, link?, type?, tenant?, req? })` → `payload.create(..., overrideAccess: true)`. The single seam where `payload.jobs.queue()` would swap in later. Pass `req` inside a hook to join its transaction. |
| `src/components/NotificationBell.tsx` | `'use client'` bell in `admin.components.actions`. Mount → REST fetch unread → open `EventSource('/api/<slug>/stream')`; prepend + `toast.info` on message; re-fetch on dropdown open (graceful degrade). Built on `@payloadcms/ui` `Popup`/`Pill`/`toast`(sonner). |
| `src/theme/notifications.css` | The single theme-indirection file. Maps Payload `--theme-*` tokens to `--pn-*` at **`:root`** so the portal-rendered `Popup` (mounted at `<body>`) can read them. Verified rendered in a real browser. |

- **SSE transport: Approach A (Payload collection endpoint).** Phase-0 spike (2026-06-07)
  confirmed a Payload endpoint returning a `text/event-stream` `Response` flushes
  **incrementally** (ticks ~1s apart under `curl -N`, not buffered) and that **`req.signal`
  abort + ReadableStream `cancel()` both fire on client disconnect**. So the live stream is a
  `/stream` collection endpoint at `/api/<notificationsSlug>/stream`; no hand-written Next.js
  route needed. (Approach B — exported Next.js route — remains the documented fallback, unused.)
- **`users` is auto-injected** by Payload (no explicit auth collection needed in the dev harness).
- **Tests:** all in `dev/*.int.spec.ts`. Pure-logic tests (types, registry, collection factory,
  fanout, stream endpoint, plugin assembly) need no DB; integration tests (`pushNotification`,
  `access-isolation`) boot the in-memory Mongo. `vitest.config.js` stubs `.css` imports so the
  `@payloadcms/ui` component chain loads under the node test env.

## Configuration

```ts
payloadPluginNotifications({
  disabled?: boolean,          // default false — installed but inert; schema stays stable
  notificationsSlug?: string,  // default 'notifications'
  usersSlug?: string,          // default 'users' — the auth collection notifications target
  tenants?: {                  // OMIT for single-tenant (recipient-only scoping)
    tenantsSlug?: string,      // default 'tenants'
    tenantFieldName?: string,  // default 'tenant'
  },
  hideFromNav?: boolean,       // default true — the bell is the UI surface
})
```

**Multi-tenant caveat:** the read filter reads a single `req.user[tenantFieldName]` (one-tenant-per-user).
The official `@payloadcms/plugin-multi-tenant` models users with a `tenants` *array*; for that, a
future optional `tenantFilter?: (req) => Where` override is the clean extension (not built in v1).

**Send a notification (server-side):**
```ts
import { pushNotification } from '@elghaied/payload-plugin-notifications'
await pushNotification(payload, { recipient: userId, message: 'Invoice paid', link: '/admin/...', type: 'success' })
// inside a hook: pass req so the create joins the transaction
```
