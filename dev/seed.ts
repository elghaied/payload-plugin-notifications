import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * Demo notifications for the dev app — gives the bell + list view real content to
 * screenshot. Backdated `createdAt` values make the relative-time labels span the
 * full range ("now" / "40m" / "3h" / "2d" / "1w"); a mix of read/unread shows the
 * unread badge, the accent bar, and the dimmed read rows. Not part of the published plugin.
 */
const sampleNotifications = (recipient: number | string) => {
  const now = Date.now()
  const ago = (ms: number) => new Date(now - ms).toISOString()

  return [
    { type: 'success', createdAt: ago(20 * 1000), link: '/admin/collections/posts', message: 'Post "Welcome to the blog" was published', read: false },
    { type: 'info', createdAt: ago(6 * MINUTE), link: '/admin/collections/posts', message: 'Sara left a comment on "Release notes"', read: false },
    { type: 'warning', createdAt: ago(40 * MINUTE), link: '/admin', message: 'Your media storage is 90% full', read: false },
    { type: 'success', createdAt: ago(3 * HOUR), link: '/admin', message: 'Invoice #1043 was paid', read: false },
    { type: 'info', createdAt: ago(8 * HOUR), link: '/admin', message: 'Your weekly digest is ready to view', read: true },
    { type: 'success', createdAt: ago(1 * DAY), link: '/admin', message: 'Deployment to production finished successfully', read: true },
    { type: 'warning', createdAt: ago(2 * DAY), link: '/admin/account', message: 'Your password will expire in 3 days', read: true },
    { type: 'info', createdAt: ago(4 * DAY), link: '/admin', message: 'New team member joined: Alex Kim', read: true },
    { type: 'success', createdAt: ago(1 * WEEK), link: '/admin', message: 'Nightly backup completed', read: true },
    { type: 'info', createdAt: ago(2 * WEEK), link: '/admin', message: 'Welcome to the dashboard 🎉', read: true },
  ].map((n) => ({ ...n, recipient }))
}

export const seed = async (payload: Payload) => {
  const { docs: existingUsers } = await payload.find({
    collection: 'users',
    limit: 1,
    where: { email: { equals: devUser.email } },
  })

  const user =
    existingUsers[0] ??
    (await payload.create({
      collection: 'users',
      data: devUser,
    }))

  // Demo notifications are for the running dev app only — skip under the test runner so
  // they don't add writes (or surprises) to every DB-booting integration spec.
  if (process.env.VITEST) {
    return
  }

  // Only seed notifications once (so a real DATABASE_URI doesn't accumulate dupes).
  const { totalDocs: existingNotifications } = await payload.count({
    collection: 'notifications',
    where: { recipient: { equals: user.id } },
  })

  if (existingNotifications === 0) {
    for (const data of sampleNotifications(user.id)) {
      // overrideAccess defaults to true in the Local API, so this bypasses the
      // system-only `create: false` access rule on the collection.
      await payload.create({ collection: 'notifications', data })
    }
    payload.logger.info(`Seeded ${sampleNotifications(user.id).length} demo notifications`)
  }
}
