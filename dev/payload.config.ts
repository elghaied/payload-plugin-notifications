import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { payloadPluginNotifications } from 'payload-plugin-notifications'
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
  const wantsMemoryDB = Boolean(process.env.VITEST || process.env.PAYLOAD_MEMORY_DB)
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
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithDB()
