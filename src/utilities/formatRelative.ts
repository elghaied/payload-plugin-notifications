export type RelativeTime = { label: string; title: string }

/**
 * Compact relative time for notification rows: now / 40m / 3h / 2d / 2w, then an
 * absolute short date past ~4 weeks. `title` is the full localized timestamp (tooltip).
 */
export const formatRelative = (date: string | undefined, nowMs: number): RelativeTime => {
  if (!date) {
    return { label: '', title: '' }
  }
  const then = Date.parse(date)
  if (Number.isNaN(then)) {
    return { label: '', title: '' }
  }
  const title = new Date(then).toLocaleString()
  const diff = Math.max(0, nowMs - then)

  const S = 1000
  const MIN = 60 * S
  const H = 60 * MIN
  const D = 24 * H
  const W = 7 * D

  let label: string
  if (diff < 45 * S) {
    label = 'now'
  } else if (diff < H) {
    label = `${Math.floor(diff / MIN)}m`
  } else if (diff < D) {
    label = `${Math.floor(diff / H)}h`
  } else if (diff < W) {
    label = `${Math.floor(diff / D)}d`
  } else if (diff < 4 * W) {
    label = `${Math.floor(diff / W)}w`
  } else {
    const d = new Date(then)
    const sameYear = d.getFullYear() === new Date(nowMs).getFullYear()
    label = d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  }
  return { label, title }
}
