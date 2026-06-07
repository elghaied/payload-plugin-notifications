import { describe, expect, test, vi } from 'vitest'

import { InMemoryRegistry } from '../src/registry/index.js'

const fakeController = () => ({ close: vi.fn(), enqueue: vi.fn() }) as unknown as ReadableStreamDefaultController

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
