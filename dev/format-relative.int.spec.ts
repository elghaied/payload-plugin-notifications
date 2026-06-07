import { describe, expect, test } from 'vitest'

import { formatRelative } from '../src/utilities/formatRelative.js'

// fixed "now": 2026-06-07T12:00:00Z
const now = Date.parse('2026-06-07T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D

describe('formatRelative', () => {
  test('under 45s -> "now"', () => {
    expect(formatRelative(ago(10 * S), now).label).toBe('now')
    expect(formatRelative(ago(44 * S), now).label).toBe('now')
  })
  test('45-59s clamps to "1m" (never "0m")', () => {
    expect(formatRelative(ago(45 * S), now).label).toBe('1m')
    expect(formatRelative(ago(59 * S), now).label).toBe('1m')
  })
  test('minutes', () => {
    expect(formatRelative(ago(60 * S), now).label).toBe('1m')
    expect(formatRelative(ago(40 * M), now).label).toBe('40m')
    expect(formatRelative(ago(59 * M), now).label).toBe('59m')
  })
  test('hours', () => {
    expect(formatRelative(ago(60 * M), now).label).toBe('1h')
    expect(formatRelative(ago(23 * H), now).label).toBe('23h')
  })
  test('days', () => {
    expect(formatRelative(ago(D), now).label).toBe('1d')
    expect(formatRelative(ago(6 * D), now).label).toBe('6d')
  })
  test('weeks', () => {
    expect(formatRelative(ago(W), now).label).toBe('1w')
    expect(formatRelative(ago(3 * W), now).label).toBe('3w')
  })
  test('past ~4 weeks -> absolute short date (no relative suffix)', () => {
    const label = formatRelative(ago(5 * W), now).label
    expect(label).not.toMatch(/(now|\dm|\dh|\dd|\dw)$/)
    expect(label.length).toBeGreaterThan(2)
  })
  test('title is the full localized timestamp', () => {
    const iso = ago(40 * M)
    expect(formatRelative(iso, now).title).toBe(new Date(iso).toLocaleString())
  })
  test('missing date -> empty label, empty title', () => {
    expect(formatRelative(undefined, now)).toEqual({ label: '', title: '' })
  })
})
