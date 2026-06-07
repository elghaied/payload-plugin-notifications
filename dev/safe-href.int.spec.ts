import { describe, expect, test } from 'vitest'

import { safeHref } from '../src/utilities/safeHref.js'

describe('safeHref', () => {
  test('allows same-origin relative paths', () => {
    expect(safeHref('/admin/collections/posts/123')).toBe('/admin/collections/posts/123')
  })

  test('allows absolute http(s) URLs', () => {
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x')
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x')
  })

  test('rejects javascript: and other script-y schemes (XSS)', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('  javascript:alert(1)')).toBeNull() // leading whitespace
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
  })

  test('rejects protocol-relative URLs', () => {
    expect(safeHref('//evil.com')).toBeNull()
  })

  test('rejects empty / missing', () => {
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
  })
})
