import type { CollectionAfterChangeHook } from 'payload'

import type { NotificationRegistry } from '../registry/index.js'

/** Resolve a relationship value that may be an id (opaque) or a populated doc. */
const toId = (rel: unknown): string => {
  if (rel && typeof rel === 'object' && 'id' in rel) {
    return String((rel as { id: unknown }).id)
  }
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
    if (operation !== 'create') {
      return doc
    }
    try {
      registry.emitToUser(toId(doc.recipient), doc)
    } catch {
      // best-effort live push; the DB row is the source of truth
    }
    return doc
  }
