import type { Endpoint, PayloadRequest } from 'payload'

import type { NotificationRegistry } from '../registry/index.js'

/**
 * SSE stream as a collection endpoint -> /api/<notificationsSlug>/stream.
 * req.user is pre-authed by Payload (cookie). Returns the streaming Response
 * immediately; registers the controller and cleans up on client disconnect.
 */
export const createStreamEndpoint = (registry: NotificationRegistry): Endpoint => ({
  handler: (req: PayloadRequest) => {
    const user = req.user
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userId = String(user.id)
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController | undefined
    let onAbort: (() => void) | undefined

    // Single cleanup using the CAPTURED controller reference (not `this`).
    const cleanup = () => {
      if (streamController) {registry.unregister(userId, streamController)}
      if (onAbort) {req.signal?.removeEventListener('abort', onAbort)}
    }

    const stream = new ReadableStream({
      cancel() {
        cleanup()
      },
      start(controller) {
        streamController = controller
        registry.register(userId, controller)
        controller.enqueue(encoder.encode(': connected\n\n'))

        onAbort = () => {
          cleanup()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
        req.signal?.addEventListener('abort', onAbort)
      },
    })

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    })
  },
  method: 'get',
  path: '/stream',
})
