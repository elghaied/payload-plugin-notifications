'use client'
import * as React from 'react'

import { safeHref } from '../utilities/safeHref.js'
import './../theme/notifications.css'

type CellProps = {
  cellData?: unknown
  rowData?: { link?: string; read?: boolean }
}

/**
 * Custom list-view cell for the notification `message` column. Payload's default
 * cell wraps the title in a link to the document EDIT view; replacing the cell
 * entirely lets us link to the notification's own `link` target instead — the
 * normal notifications flow (click → go where it points, not edit the row).
 */
export const NotificationCell = (props: CellProps) => {
  const { cellData, rowData } = props
  const text = typeof cellData === 'string' ? cellData : String(cellData ?? '')
  const href = safeHref(rowData?.link) // reject javascript:/data: etc. (XSS)

  if (!href) {
    return <span>{text}</span>
  }

  return (
    <a className={`pn-cell-link${rowData?.read ? ' pn-cell-link--read' : ''}`} href={href}>
      {text}
    </a>
  )
}
