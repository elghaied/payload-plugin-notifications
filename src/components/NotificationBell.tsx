'use client'
import { Pill, Popup, toast, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import './../theme/notifications.css'

type Notification = {
  id: string
  link?: string
  message: string
  read?: boolean
  type?: 'info' | 'success' | 'warning'
}

export const NotificationBell = ({ slug = 'notifications' }: { slug?: string }) => {
  const { config } = useConfig()
  const apiRoute = config.routes.api
  const [items, setItems] = useState<Notification[]>([])

  const unread = items.filter((n) => !n.read).length

  const fetchUnread = useCallback(async () => {
    const res = await fetch(
      `${apiRoute}/${slug}?where[read][equals]=false&sort=-createdAt&limit=20`,
      { credentials: 'include' },
    )
    if (!res.ok) {
      return
    }
    const data = await res.json()
    setItems(data.docs ?? [])
  }, [apiRoute, slug])

  useEffect(() => {
    void fetchUnread()
    const es = new EventSource(`${apiRoute}/${slug}/stream`, { withCredentials: true })
    es.onmessage = (e) => {
      try {
        const doc = JSON.parse(e.data) as Notification
        setItems((prev) => [doc, ...prev])
        toast.info(doc.message)
      } catch {
        // keep-alive comment, ignore
      }
    }
    es.onerror = () => {
      // graceful degrade: rely on fetchUnread when the dropdown opens
    }
    return () => es.close()
  }, [apiRoute, slug, fetchUnread])

  const markRead = async (n: Notification) => {
    await fetch(`${apiRoute}/${slug}/${n.id}`, {
      body: JSON.stringify({ read: true }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    })
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    if (n.link) {
      window.location.href = n.link
    }
  }

  return (
    <Popup
      button={
        <span
          aria-label="Notifications"
          style={{ alignItems: 'center', display: 'inline-flex', gap: 4, position: 'relative' }}
        >
          <span aria-hidden="true" role="img">
            🔔
          </span>
          {unread > 0 && <Pill>{unread}</Pill>}
        </span>
      }
      render={() => (
        <div
          className="pn-panel"
          onClick={fetchUnread}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              void fetchUnread()
            }
          }}
          role="menu"
          tabIndex={0}
        >
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
        </div>
      )}
      showScrollbar
    />
  )
}
