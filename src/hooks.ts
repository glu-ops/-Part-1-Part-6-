import { useState, useEffect } from 'react'

/** 是否為桌面寬度（≥1024px，對應 Tailwind lg） */
export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)'
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = () => setMatch(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return match
}
