'use client'
import { Pill, Popup, toast, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { NotificationItem } from './NotificationRow.js'

import { useMinuteTick } from '../hooks/useMinuteTick.js'
import { markNotificationRead } from '../utilities/markNotificationRead.js'
import { safeHref } from '../utilities/safeHref.js'
import { BellIcon } from './BellIcon.js'
import { NotificationRow } from './NotificationRow.js'
import './../theme/notifications.css'

export const NotificationBell = ({
  slug = 'notifications',
  hideFromNav = false,
}: {
  hideFromNav?: boolean
  slug?: string
}) => {
  const { config } = useConfig()
  const apiRoute = config.routes.api
  const adminRoute = config.routes.admin
  const nowMs = useMinuteTick()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    const listRes = await fetch(`${apiRoute}/${slug}?depth=0&limit=20&sort=-createdAt`, {
      credentials: 'include',
    })
    if (listRes.ok) {
      const data = await listRes.json()
      setItems(data.docs ?? [])
    }
    const countRes = await fetch(`${apiRoute}/${slug}?depth=0&limit=0&where[read][equals]=false`, {
      credentials: 'include',
    })
    if (countRes.ok) {
      const data = await countRes.json()
      setUnreadCount(data.totalDocs ?? 0)
    }
  }, [apiRoute, slug])

  useEffect(() => {
    void refresh()
    const es = new EventSource(`${apiRoute}/${slug}/stream`, { withCredentials: true })
    es.onmessage = (e) => {
      try {
        const doc = JSON.parse(e.data) as NotificationItem
        setItems((prev) => [doc, ...prev].slice(0, 20))
        setUnreadCount((c) => c + 1)
        toast.info(doc.message)
      } catch {
        // keep-alive comment, ignore
      }
    }
    es.onerror = () => {
      // graceful degrade
    }
    return () => es.close()
  }, [apiRoute, slug, refresh])

  const activate = useCallback(
    async (n: NotificationItem) => {
      if (!n.read) {
        await markNotificationRead(apiRoute, slug, n.id)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      const href = safeHref(n.link)
      if (href) {
        window.location.href = href
      }
    },
    [apiRoute, slug],
  )

  return (
    <Popup
      button={
        <span aria-label="Notifications" className="pn-bell">
          <BellIcon size={20} />
          {unreadCount > 0 && <Pill>{unreadCount}</Pill>}
        </span>
      }
      onToggleOpen={(active) => {
        if (active) {
          void refresh()
        }
      }}
      render={() => (
        <div className="pn-panel" role="menu" tabIndex={-1}>
          <div className="pn-title">Notifications</div>
          {items.length === 0 && <div className="pn-empty">No notifications</div>}
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} nowMs={nowMs} onActivate={activate} size="dropdown" />
          ))}
          {!hideFromNav && (
            <a className="pn-seeall" href={`${adminRoute}/collections/${slug}`}>
              See all notifications
            </a>
          )}
        </div>
      )}
      showScrollbar
    />
  )
}
