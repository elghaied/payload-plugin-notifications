import type { Access, CollectionConfig, Field, Where } from 'payload'

import type { SanitizedConfig } from '../types.js'

import { NOTIFICATION_TYPES } from '../types.js'

export const createNotificationsCollection = (config: SanitizedConfig): CollectionConfig => {
  const { hideFromNav, notificationsSlug, tenants, usersSlug } = config

  const recipientWhere = (userId: number | string): Where => ({ recipient: { equals: userId } })

  const read: Access = ({ req }) => {
    const user = req.user
    if (!user) { return false }
    const base = recipientWhere(user.id)
    if (tenants) {
      const tenantValue = (user as Record<string, unknown>)[tenants.tenantFieldName]
      if (tenantValue === undefined || tenantValue === null) { return false }
      return { and: [base, { [tenants.tenantFieldName]: { equals: tenantValue } }] }
    }
    return base
  }

  const ownRows: Access = ({ req }) => (req.user ? recipientWhere(req.user.id) : false)

  const tenantField: Field[] = tenants
    ? [
        {
          name: tenants.tenantFieldName,
          type: 'relationship',
          index: true,
          label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:tenant'),
          relationTo: tenants.tenantsSlug,
          required: true,
        },
      ]
    : []

  const collection: CollectionConfig = {
    slug: notificationsSlug,
    access: {
      create: () => false,
      delete: ownRows,
      read,
      update: ownRows,
    },
    admin: {
      components: {
        views: {
          list: {
            Component: {
              clientProps: { slug: notificationsSlug },
              path: '@elghaied/payload-plugin-notifications/client#NotificationsListView',
            },
          },
        },
      },
      defaultColumns: ['message', 'type', 'read', 'createdAt'],
      hidden: hideFromNav,
      useAsTitle: 'message',
    },
    fields: [
      {
        name: 'recipient',
        type: 'relationship',
        index: true,
        label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:recipient'),
        relationTo: usersSlug,
        required: true,
      },
      ...tenantField,
      {
        name: 'message',
        type: 'text',
        label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:message'),
        required: true,
      },
      {
        name: 'link',
        type: 'text',
        label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:link'),
      },
      {
        name: 'type',
        type: 'select',
        defaultValue: 'info',
        label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:type'),
        options: NOTIFICATION_TYPES.map((value) => ({
          label: ({ t }) =>
            (t as unknown as (k: string) => string)(
              `plugin-notifications:type${value.charAt(0).toUpperCase()}${value.slice(1)}`,
            ),
          value,
        })),
      },
      {
        name: 'read',
        type: 'checkbox',
        defaultValue: false,
        index: true,
        label: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:read'),
      },
    ],
    labels: {
      plural: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:plural'),
      singular: ({ t }) => (t as unknown as (k: string) => string)('plugin-notifications:singular'),
    },
    timestamps: true,
  }

  return collection
}
