import { describe, expect, test, vi } from 'vitest'

import type { NotificationRegistry } from '../src/registry/index.js'

import { createFanoutHook } from '../src/hooks/fanout.js'

const makeRegistry = () => {
  const emitToUser = vi.fn()
  const registry: NotificationRegistry = { emitToUser, register: vi.fn(), unregister: vi.fn() }
  return { emitToUser, registry }
}

describe('createFanoutHook', () => {
  test('on create, emits the doc to the recipient id (relationship as id)', async () => {
    const { emitToUser, registry } = makeRegistry()
    const hook = createFanoutHook(registry)
    const doc = { id: 'n1', type: 'info', message: 'hi', read: false, recipient: 'u1' }
    await hook({ doc, operation: 'create' } as any)
    expect(emitToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'n1', message: 'hi' }))
  })

  test('resolves recipient when populated as an object', async () => {
    const { emitToUser, registry } = makeRegistry()
    const hook = createFanoutHook(registry)
    const doc = { id: 'n2', message: 'hey', recipient: { id: 'u2' } }
    await hook({ doc, operation: 'create' } as any)
    expect(emitToUser).toHaveBeenCalledWith('u2', expect.objectContaining({ id: 'n2' }))
  })

  test('does not emit on update', async () => {
    const { emitToUser, registry } = makeRegistry()
    const hook = createFanoutHook(registry)
    await hook({ doc: { id: 'n3', recipient: 'u1' }, operation: 'update' } as any)
    expect(emitToUser).not.toHaveBeenCalled()
  })
})
