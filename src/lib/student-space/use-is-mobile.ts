import { useEffect, useState } from 'react'

/**
 * SSR-safe match for the `max-[640px]:` mobile breakpoint used across the
 * student-space chrome (SideRail vs MobileNav, sheet primitive collapse,
 * LettersSheet master/detail). Returns `false` during SSR; initializes from
 * `window.matchMedia` on first client render so the post-hydration value is
 * correct on first paint.
 *
 * The numeric breakpoint mirrors the Tailwind arbitrary-value `max-[640px]:`
 * convention. Keep them in sync — there is no shared token because Tailwind
 * v4 arbitrary variants do not consume `@theme` values.
 */
const MOBILE_QUERY = '(max-width: 640px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
