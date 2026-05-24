import { useEffect, useRef } from 'react'
import { ONBOARDING_COPY } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'

/**
 * `first-capture` stage surface.
 *
 * Headless — it owns no DOM of its own. On mount it opens the same
 * AskSheet used from the home capture button, listens for its commit
 * event, and advances to `bloom-celebrate`. If the user closes the sheet
 * without committing we re-open it on the next tick so the only way out
 * of this stage is to actually share something (or use the SkipButton).
 */
const ASK_CAPTURE_COMMITTED_EVENT = 'ss:ask-capture-committed'

export function FirstCapture({ onAdvance }: { onAdvance: () => void }) {
  const overlay = useEngineOverlay()
  const committedRef = useRef(false)
  const openCaptureRef = useRef(overlay.openCapture)
  openCaptureRef.current = overlay.openCapture

  useEffect(() => {
    const handler = () => {
      if (committedRef.current) return
      committedRef.current = true
      // Defer the stage advance to the next tick so the AskSheet's own
      // close() can finish setting overlay.activeCapture = null before
      // OnboardingFlow re-renders into BloomCelebrate. Without the defer,
      // the synchronous setState chain inside commitCapture can race
      // against the overlay close and leave the AskSheet visually open
      // while the bloom ceremony tries to run behind it.
      window.setTimeout(() => onAdvance(), 0)
    }
    window.addEventListener(ASK_CAPTURE_COMMITTED_EVENT, handler)
    return () => {
      window.removeEventListener(ASK_CAPTURE_COMMITTED_EVENT, handler)
    }
  }, [onAdvance])

  useEffect(() => {
    if (committedRef.current) return
    if (overlay.activeCapture === 'ask') return
    const id = window.setTimeout(() => {
      if (committedRef.current) return
      openCaptureRef.current('ask', {
        prompt: ONBOARDING_COPY.firstCapture.prompt,
      })
    }, 80)
    return () => window.clearTimeout(id)
  }, [overlay.activeCapture])

  return null
}
