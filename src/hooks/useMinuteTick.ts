'use client'
import { useEffect, useState } from 'react'

/** Returns a `nowMs` epoch that updates every `intervalMs` (default 60s) so relative
 *  timestamps re-render without a refetch. One timer per consuming surface. */
export const useMinuteTick = (intervalMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
