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
      defaultColumns: ['message', 'type', 'read', 'createdAt'],
      hidden: hideFromNav,
      useAsTitle: 'message',
    },
    fields: [
      {
        name: 'recipient',
        type: 'relationship',
        index: true,
        relationTo: usersSlug,
        required: true,
      },
      ...tenantField,
      { name: 'message', type: 'text', required: true },
      { name: 'link', type: 'text' },
      {
        name: 'type',
        type: 'select',
        defaultValue: 'info',
        options: NOTIFICATION_TYPES.map((value) => ({ label: value, value })),
      },
      { name: 'read', type: 'checkbox', defaultValue: false, index: true },
    ],
    timestamps: true,
  }

  return collection
}
