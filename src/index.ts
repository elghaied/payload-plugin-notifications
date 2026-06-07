import type { Config, Plugin } from 'payload'

import type { NotificationsPluginConfig } from './types.js'

import { createNotificationsCollection } from './collections/notifications.js'
import { createStreamEndpoint } from './endpoints/stream.js'
import { createFanoutHook } from './hooks/fanout.js'
import { notificationRegistry } from './registry/index.js'
import { sanitizeConfig } from './types.js'

export const payloadPluginNotifications =
  (pluginOptions: NotificationsPluginConfig = {}): Plugin =>
  (config: Config): Config => {
    const sanitized = sanitizeConfig(pluginOptions)

    const collection = createNotificationsCollection(sanitized)

    if (!config.collections) {
      config.collections = []
    }

    if (!sanitized.disabled) {
      collection.endpoints = [
        ...(collection.endpoints || []),
        createStreamEndpoint(notificationRegistry),
      ]
      collection.hooks = {
        ...collection.hooks,
        afterChange: [createFanoutHook(notificationRegistry), ...(collection.hooks?.afterChange || [])],
      }
    }

    config.collections.push(collection)

    if (sanitized.disabled) {
      return config
    }

    if (!config.admin) {
      config.admin = {}
    }
    if (!config.admin.components) {
      config.admin.components = {}
    }
    if (!config.admin.components.actions) {
      config.admin.components.actions = []
    }
    config.admin.components.actions.push({
      clientProps: { slug: sanitized.notificationsSlug, hideFromNav: sanitized.hideFromNav },
      path: '@elghaied/payload-plugin-notifications/client#NotificationBell',
    })

    return config
  }

export { pushNotification } from './pushNotification.js'
export type { PushNotificationArgs } from './pushNotification.js'
export { notificationRegistry } from './registry/index.js'
export type { NotificationRegistry } from './registry/index.js'
export type { NotificationsPluginConfig, NotificationType, TenantsConfig } from './types.js'
