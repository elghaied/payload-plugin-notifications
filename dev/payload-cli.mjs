// Robust wrapper around the Payload CLI (generate:types / generate:importmap / etc).
//
// Why this exists: `payload generate:types` writes its output file successfully and the
// MAIN process exits 0, but it leaves an orphaned child node process behind that never
// exits and spins at ~100% CPU retrying the DB connection. Run repeatedly (every schema or
// component change), these orphans pile up and pin the machine. A plain `timeout` can't kill
// them because the orphan reparents to init, leaving the parent's process tree.
//
// Fix: launch the CLI in its OWN process group (`detached: true`), then force-kill the entire
// group as soon as the work is done — detected via the CLI's completion log line, or the
// process exiting cleanly, or a hard timeout backstop. Nothing survives this wrapper.
import { spawn } from 'node:child_process'
import path from 'node:path'

const bin = path.resolve('node_modules/.bin/payload')
const args = process.argv.slice(2)

const child = spawn(bin, args, {
  detached: true, // new process group, so we can reap any orphan it spawns
  env: {
    ...process.env,
    PAYLOAD_CONFIG_PATH: process.env.PAYLOAD_CONFIG_PATH ?? './dev/payload.config.ts',
  },
  stdio: ['inherit', 'pipe', 'pipe'],
})

// Completion markers printed by the CLI once its real work is finished.
const DONE = /Types written to|import map to|import map written|Generated import map/i
const TIMEOUT_MS = Number(process.env.PAYLOAD_CLI_TIMEOUT_MS ?? 90000)

let settled = false
const reap = (code) => {
  if (settled) return
  settled = true
  try {
    process.kill(-child.pid, 'SIGKILL') // negative pid => kill the whole process group
  } catch {
    /* group already gone */
  }
  process.exit(code)
}

const relay = (out) => (buf) => {
  out.write(buf)
  if (DONE.test(buf.toString())) setTimeout(() => reap(0), 400) // let the file flush, then reap
}
child.stdout.on('data', relay(process.stdout))
child.stderr.on('data', relay(process.stderr))
child.on('exit', (code) => reap(code ?? 0))
child.on('error', (err) => {
  console.error(err)
  reap(1)
})

const backstop = setTimeout(() => {
  console.error(`payload-cli: no completion after ${TIMEOUT_MS}ms — killing process group`)
  reap(1)
}, TIMEOUT_MS)
backstop.unref?.()
