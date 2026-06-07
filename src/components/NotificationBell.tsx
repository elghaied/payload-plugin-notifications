'use client'
import { Pill, Popup, toast, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import { BellIcon } from './BellIcon.js'
import './../theme/notifications.css'

type Notification = {
  id: string
  link?: string
  message: string
  read?: boolean
  type?: 'info' | 'success' | 'warning'
}

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
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Load the recent notifications (read AND unread, so opened ones stay visible) for the
  // dropdown, plus an authoritative unread count for the badge (not capped by the list limit).
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
        const doc = JSON.parse(e.data) as Notification
        setItems((prev) => [doc, ...prev].slice(0, 20))
        setUnreadCount((c) => c + 1)
        toast.info(doc.message)
      } catch {
        // keep-alive comment, ignore
      }
    }
    es.onerror = () => {
      // graceful degrade: rely on refresh() when the dropdown opens
    }
    return () => es.close()
  }, [apiRoute, slug, refresh])

  const markRead = async (n: Notification) => {
    if (!n.read) {
      await fetch(`${apiRoute}/${slug}/${n.id}`, {
        body: JSON.stringify({ read: true }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      // Keep the item in the list (just mark it read) — recent history stays visible.
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    if (n.link) {
      window.location.href = n.link
    }
  }

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
            <div
              className={`pn-item${n.read ? ' pn-item--read' : ''}`}
              key={n.id}
              onClick={() => void markRead(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  void markRead(n)
                }
              }}
              role="menuitem"
              tabIndex={0}
            >
              <span className={`pn-dot pn-dot--${n.type ?? 'info'}`} />
              <div style={{ flex: 1 }}>
                <div>{n.message}</div>
                {n.link && <div className="pn-meta">{n.link}</div>}
              </div>
            </div>
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
