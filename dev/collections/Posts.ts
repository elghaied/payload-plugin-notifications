import type { CollectionConfig } from 'payload'

import { pushNotification } from '@elghaied/payload-plugin-notifications'

/**
 * Demo collection for the dev app: creating a Post in the admin fires an in-app
 * notification to the user who created it — so you can watch the live bell react
 * to a real admin action. Not part of the published plugin.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
  },
  fields: [{ name: 'title', type: 'text', required: true }],
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        // Only on create, and only when a real user performed the action.
        if (operation !== 'create' || !req.user) {
          return doc
        }
        try {
          // Pass `req` so the notification write joins this operation's transaction.
          await pushNotification(req.payload, {
            type: 'success',
            link: `/admin/collections/posts/${doc.id}`,
            message: `Post "${doc.title}" was created`,
            recipient: req.user.id,
            req,
          })
        } catch (err) {
          req.payload.logger.error({ err, msg: 'demo: failed to push notification' })
        }
        return doc
      },
    ],
  },
}
