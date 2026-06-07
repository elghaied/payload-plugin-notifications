'use client'
import { Gutter, useConfig, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { PluginNotificationsTranslationKeys, PluginNotificationsTranslations } from '../translations/index.js'
import type { NotificationItem } from './NotificationRow.js'

import { useMinuteTick } from '../hooks/useMinuteTick.js'
import { markNotificationRead } from '../utilities/markNotificationRead.js'
import { safeHref } from '../utilities/safeHref.js'
import { NotificationRow } from './NotificationRow.js'
import './../theme/notifications.css'

const PAGE_SIZE = 25

export const NotificationsListView = ({ slug = 'notifications' }: { slug?: string }) => {
  const { config } = useConfig()
  const { t } = useTranslation<PluginNotificationsTranslations, PluginNotificationsTranslationKeys>()
  const apiRoute = config.routes.api
  const nowMs = useMinuteTick()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      const res = await fetch(
        `${apiRoute}/${slug}?depth=0&limit=${PAGE_SIZE}&page=${p}&sort=-createdAt`,
        { credentials: 'include' },
      )
      if (res.ok) {
        const data = await res.json()
        setItems(data.docs ?? [])
        setTotalPages(data.totalPages ?? 1)
        setPage(data.page ?? p)
      }
      setLoading(false)
    },
    [apiRoute, slug],
  )

  useEffect(() => {
    void load(1)
  }, [load])

  const activate = useCallback(
    async (n: NotificationItem) => {
      if (!n.read) {
        await markNotificationRead(apiRoute, slug, n.id)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      }
      const href = safeHref(n.link)
      if (href) {
        window.location.href = href
      }
    },
    [apiRoute, slug],
  )

  return (
    <Gutter className="pn-list">
      <h1 className="pn-list__header">{t('plugin-notifications:plural')}</h1>
      {loading && items.length === 0 && <div className="pn-empty">{t('plugin-notifications:loading')}</div>}
      {!loading && items.length === 0 && <div className="pn-empty">{t('plugin-notifications:empty')}</div>}
      <div className="pn-list__rows">
        {items.map((n) => (
          <NotificationRow key={n.id} notification={n} nowMs={nowMs} onActivate={activate} size="list" />
        ))}
      </div>
      {totalPages > 1 && (
        <nav aria-label={t('plugin-notifications:paginationLabel')} className="pn-pager">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              aria-current={p === page ? 'page' : undefined}
              className={`pn-pager__btn${p === page ? ' pn-pager__btn--active' : ''}`}
              key={p}
              onClick={() => void load(p)}
              type="button"
            >
              {p}
            </button>
          ))}
        </nav>
      )}
    </Gutter>
  )
}
