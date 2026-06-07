# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file tight and skimmable —
it loads into context every session, so bloat costs you.

> Seed file. It **grows**: each completed phase (WORKFLOW, Phase 4) feeds proven patterns back
> into the relevant section below. The rich version is the *output* of running the workflow.

---

## What this is

<!-- One paragraph: what the plugin does, which collections/hooks/endpoints/components it adds. -->

A Payload CMS 3.x plugin that adds **in-app notifications** for admin users: a `notifications`
collection plus admin UI (a bell/indicator with an unread count and a dropdown/list of
notifications, mark-as-read). Exact collection shape, delivery triggers, access model, and UI
surface are being refined in brainstorming — this paragraph will be tightened once the spec lands.

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

---

## Architecture

<!-- Grows via WORKFLOW Phase 4: collections, hooks, services, config options, plugin hooks. -->

- **SSE transport: Approach A (Payload collection endpoint).** Phase-0 spike (2026-06-07)
  confirmed a Payload endpoint returning a `text/event-stream` `Response` flushes
  **incrementally** (ticks ~1s apart under `curl -N`, not buffered) and that **`req.signal`
  abort + ReadableStream `cancel()` both fire on client disconnect**. So the live stream is a
  `/stream` collection endpoint at `/api/<notificationsSlug>/stream`; no hand-written Next.js
  route needed. (Approach B — exported Next.js route — remains the documented fallback, unused.)

## Configuration

<!-- Grows: document each plugin config option as it lands. -->
