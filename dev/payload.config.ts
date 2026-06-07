import { payloadPluginNotifications } from '@elghaied/payload-plugin-notifications'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

// Self-contained, single-adapter Mongo harness (no Docker, no external service).
//
// - If you set DATABASE_URI yourself, we use that real Mongo.
// - Otherwise, the app (pnpm dev / pnpm start) and the test runner spin up a single-node
//   in-memory replica set. That path is gated on an explicit flag — PAYLOAD_MEMORY_DB (set by
//   the dev/start scripts) or VITEST (set by Vitest) — so one-shot CLI commands like
//   generate:types / generate:importmap NEVER spawn an untracked mongod that pins the CPU.
//   Those commands don't need a DB and fail fast via serverSelectionTimeoutMS if none is up.
const buildConfigWithDB = async () => {
  const externalURI = process.env.DATABASE_URI || process.env.DATABASE_URL
  // Payload fire-and-forgets `generate:types` / `generate:importmap` child processes on every
  // non-production init (see payload/dist/index.js — `void this.bin({ args: ['generate:types'] })`).
  // Those children INHERIT this process's env, so a plain `VITEST`/`PAYLOAD_MEMORY_DB` gate makes
  // each one boot its own in-memory replset and spin forever (they reparent to init, unreaped).
  // The actual test runner / app process owns the DB lifecycle — a generate:* CLI never does — so
  // exclude generate:* invocations from spinning up the memory DB regardless of inherited flags.
  const isGenerateCli = process.argv.some(
    (a) => a === 'generate:types' || a === 'generate:importmap',
  )
  const wantsMemoryDB =
    !isGenerateCli && Boolean(process.env.VITEST || process.env.PAYLOAD_MEMORY_DB)
  let url = externalURI || ''

  if (!externalURI && wantsMemoryDB) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server')
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'payloadtest' },
    })
    url = `${memoryDB.getUri()}&retryWrites=true`
  }

  return buildConfig({
    admin: {
      importMap: {
        // Don't auto-spawn `generate:importmap` on every init — we regen explicitly via the CLI.
        autoGenerate: false,
        baseDir: path.resolve(dirname),
      },
    },
    collections: [],
    db: mongooseAdapter({
      connectOptions: { serverSelectionTimeoutMS: 2000 },
      ensureIndexes: true,
      url,
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [payloadPluginNotifications({})],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      // Don't fire-and-forget a `generate:types` child on every init (the orphan-spawn source).
      // Regen explicitly via `pnpm dev:generate-types` (routed through the reaping CLI wrapper).
      autoGenerate: false,
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithDB()
