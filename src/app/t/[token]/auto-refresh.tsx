'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Re-runs the server component on an interval, without a full page reload. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])

  return null
}
