'use client'
import { formatRelative } from '../utilities/formatRelative.js'

export type NotificationItem = {
  createdAt?: string
  id: string
  link?: string
  message: string
  read?: boolean
  type?: 'info' | 'success' | 'warning'
}

type NotificationRowProps = {
  notification: NotificationItem
  nowMs: number
  onActivate: (n: NotificationItem) => void
  size?: 'dropdown' | 'list'
}

export const NotificationRow = ({
  notification,
  nowMs,
  onActivate,
  size = 'dropdown',
}: NotificationRowProps) => {
  const { label, title } = formatRelative(notification.createdAt, nowMs)
  const cls = [
    'pn-row',
    `pn-row--${size}`,
    notification.read ? 'pn-row--read' : 'pn-row--unread',
  ].join(' ')

  return (
    <div
      className={cls}
      onClick={() => onActivate(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate(notification)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="pn-row__msg">{notification.message}</span>
      <time className="pn-row__time" dateTime={notification.createdAt} title={title}>
        {label}
      </time>
    </div>
  )
}
