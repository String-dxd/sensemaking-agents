import { useEffect, useState } from 'react'

import { cn } from '~/lib/utils'

const DISMISS_STORAGE_KEY = 'sm:share-owner-banner-dismissed'

/**
 * Sticky strip at the top of the public share page, shown only when the
 * authenticated viewer is the link's owner. The strip pushes content down
 * (rather than overlaying) so it never obscures the page header or the
 * dimension nav.
 *
 * Dismiss state lives in sessionStorage so navigating away and back keeps
 * the banner hidden within a session, but a fresh tab still gets the
 * orientation cue.
 */
export function OwnerPreviewBanner({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_STORAGE_KEY) === '1') setDismissed(true)
    } catch {
      /* sessionStorage unavailable (private mode) — show every time. */
    }
  }, [])

  if (dismissed) return null

  const onDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[#e6dcc9]/80 bg-[#fdfaf3]/95 px-4 py-2 text-xs sm:text-[13px] backdrop-blur',
        className,
      )}
      data-testid="owner-preview-banner"
    >
      <p className="text-[#2b2620]/75">
        This is what others see —{' '}
        <a
          href="/me"
          className="font-medium text-[#2b2620] underline decoration-[#2b2620]/40 underline-offset-2 hover:decoration-[#2b2620]"
        >
          back to your profile
        </a>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss owner preview banner"
        className="shrink-0 rounded-full px-2 py-1 text-[#2b2620]/55 transition-colors hover:bg-[#2b2620]/10 hover:text-[#2b2620]"
      >
        ×
      </button>
    </div>
  )
}
