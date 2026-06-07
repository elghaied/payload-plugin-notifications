export interface TenantsConfig {
  /** Name of the tenant relationship field added to notifications. @default 'tenant' */
  tenantFieldName?: string
  /** Slug of the tenants collection. @default 'tenants' */
  tenantsSlug?: string
}

export interface NotificationsPluginConfig {
  /** Installed but inert; schema stays stable. @default false */
  disabled?: boolean
  /** Hide the notifications collection from the admin nav. @default true */
  hideFromNav?: boolean
  /** Slug for the notifications collection. @default 'notifications' */
  notificationsSlug?: string
  /** Enable multi-tenant scoping. Omit for single-tenant (recipient-only). */
  tenants?: TenantsConfig
  /** Slug of the auth collection notifications are addressed to. @default 'users' */
  usersSlug?: string
}

export interface SanitizedTenantsConfig {
  tenantFieldName: string
  tenantsSlug: string
}

export interface SanitizedConfig {
  disabled: boolean
  hideFromNav: boolean
  notificationsSlug: string
  tenants: null | SanitizedTenantsConfig
  usersSlug: string
}

export const sanitizeConfig = (opts: NotificationsPluginConfig = {}): SanitizedConfig => ({
  disabled: opts.disabled ?? false,
  hideFromNav: opts.hideFromNav ?? true,
  notificationsSlug: opts.notificationsSlug ?? 'notifications',
  tenants: opts.tenants
    ? {
        tenantFieldName: opts.tenants.tenantFieldName ?? 'tenant',
        tenantsSlug: opts.tenants.tenantsSlug ?? 'tenants',
      }
    : null,
  usersSlug: opts.usersSlug ?? 'users',
})

export type NotificationType = 'info' | 'success' | 'warning'
export const NOTIFICATION_TYPES: NotificationType[] = ['info', 'warning', 'success']
