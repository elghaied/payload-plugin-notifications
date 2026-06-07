import path from 'path'
import { loadEnv } from 'payload/node'
import { fileURLToPath } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Vite plugin that stubs all .css imports to empty modules in the node test environment */
const cssStubPlugin = {
  name: 'css-stub',
  load(id) {
    if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.sass')) {
      return 'export default {}'
    }
  },
  transform(code, id) {
    if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.sass')) {
      return { code: 'export default {}', map: null }
    }
  },
}

export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    plugins: [
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
      cssStubPlugin,
    ],
    test: {
      include: ['dev/**/*int.spec.ts'],
      exclude: ['**/node_modules/**', 'dev/**/*e2e.spec.ts'],
      environment: 'node',
      hookTimeout: 30_000,
      testTimeout: 30_000,
      css: false,
      server: {
        deps: {
          inline: [/\.css$/, /@payloadcms\/ui/],
        },
      },
    },
  }
})
