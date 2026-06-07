import type { Payload, PayloadRequest } from 'payload'

import type { NotificationType } from './types.js'

export interface PushNotificationArgs {
  link?: string
  message: string
  /** Override the collection slug if customized in plugin config. @default 'notifications' */
  notificationsSlug?: string
  recipient: number | string
  /** Pass when calling from inside a hook so the create joins the same transaction. */
  req?: PayloadRequest
  /** Required when multi-tenant is configured (unless auto-assigned). */
  tenant?: number | string
  /** @default 'info' */
  type?: NotificationType
}

/**
 * Public write API. Creates a notification row; the collection's afterChange
 * fan-out hook performs the best-effort SSE push as a side effect. Future:
 * swap this create for payload.jobs.queue() for async/digest notifications.
 */
export const pushNotification = async (
  payload: Payload,
  {
    type = 'info',
    link,
    message,
    notificationsSlug = 'notifications',
    recipient,
    req,
    tenant,
  }: PushNotificationArgs,
) =>
  payload.create({
    collection: notificationsSlug,
    data: { type, link, message, recipient, ...(tenant !== undefined ? { tenant } : {}) },
    overrideAccess: true,
    req,
  })
