/**
 * Live-connection registry. In-memory now; a distributed implementation
 * (Postgres LISTEN/NOTIFY or Mongo change streams) can be dropped in behind
 * this same interface for multi-replica later. No Redis. See the design spec §7.
 */
export interface NotificationRegistry {
  emitToUser(userId: string, payload: unknown): void
  register(userId: string, controller: ReadableStreamDefaultController): void
  unregister(userId: string, controller: ReadableStreamDefaultController): void
}

export class InMemoryRegistry implements NotificationRegistry {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>()
  private encoder = new TextEncoder()

  emitToUser(userId: string, payload: unknown): void {
    const set = this.connections.get(userId)
    if (!set) {
      return
    }
    const chunk = this.encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
    for (const controller of set) {
      try {
        controller.enqueue(chunk)
      } catch {
        set.delete(controller)
      }
    }
    if (set.size === 0) {
      this.connections.delete(userId)
    }
  }

  register(userId: string, controller: ReadableStreamDefaultController): void {
    let set = this.connections.get(userId)
    if (!set) {
      set = new Set()
      this.connections.set(userId, set)
    }
    set.add(controller)
  }

  /** Test/diagnostic helper: number of users with at least one live connection. */
  size(): number {
    return this.connections.size
  }

  unregister(userId: string, controller: ReadableStreamDefaultController): void {
    const set = this.connections.get(userId)
    if (!set) {
      return
    }
    set.delete(controller)
    if (set.size === 0) {
      this.connections.delete(userId)
    }
  }
}

/** Process-wide singleton used by the endpoint + fan-out hook. */
export const notificationRegistry: { size?(): number } & NotificationRegistry = new InMemoryRegistry()
