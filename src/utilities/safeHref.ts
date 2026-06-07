/**
 * Guard a notification `link` (a data-controlled text field) before it becomes a
 * navigation target. Notifications are system-generated, but a host app may build
 * `link` from user input, so reject anything that could execute script:
 *   - allow same-origin relative paths ("/admin/...") but NOT protocol-relative ("//evil")
 *   - allow absolute http(s) URLs
 *   - reject everything else (javascript:, data:, vbscript:, file:, …) → returns null
 */
export const safeHref = (link: null | string | undefined): null | string => {
  if (!link) {
    return null
  }
  const trimmed = link.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') ? null : trimmed
  }
  try {
    const { protocol } = new URL(trimmed)
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}
