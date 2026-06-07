import { describe, expect, test, vi } from 'vitest'

import type { NotificationRegistry } from '../src/registry/index.js'

import { createStreamEndpoint } from '../src/endpoints/stream.js'

const makeRegistry = () => {
  const calls = { emitToUser: vi.fn(), register: vi.fn(), unregister: vi.fn() }
  return { calls, registry: calls as unknown as NotificationRegistry }
}

describe('createStreamEndpoint', () => {
  test('mounts GET /stream', () => {
    const { registry } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    expect(ep.path).toBe('/stream')
    expect(ep.method).toBe('get')
  })

  test('401 when unauthenticated', async () => {
    const { calls, registry } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    const res = await ep.handler({ signal: new AbortController().signal, user: null } as any)
    expect(res.status).toBe(401)
    expect(calls.register).not.toHaveBeenCalled()
  })

  test('authed: returns an event-stream and registers the connection', async () => {
    const { calls, registry } = makeRegistry()
    const ep = createStreamEndpoint(registry)
    const res = await ep.handler({ signal: new AbortController().signal, user: { id: 'u1' } } as any)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(calls.register).toHaveBeenCalledWith('u1', expect.anything())
  })

  test('unregisters on abort', async () => {
    const { calls, registry } = makeRegistry()
    const controller = new AbortController()
    const ep = createStreamEndpoint(registry)
    await ep.handler({ signal: controller.signal, user: { id: 'u1' } } as any)
    controller.abort()
    expect(calls.unregister).toHaveBeenCalledWith('u1', expect.anything())
  })
})
