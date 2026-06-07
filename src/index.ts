import type { Config } from 'payload'

export type PayloadPluginNotificationsConfig = {
  /**
   * Set to true to keep the plugin installed but inert (schema stays stable).
   */
  disabled?: boolean
}

export const payloadPluginNotifications =
  (pluginOptions: PayloadPluginNotificationsConfig = {}) =>
  (config: Config): Config => {
    if (pluginOptions.disabled) {
      return config
    }

    // Build your plugin here: add collections, fields, hooks, endpoints, components.

    return config
  }
