import { MessageCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EMOTION_BY_ID } from '~/lib/student-space/mood-shapes'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { cn } from '~/lib/utils'

type Particle = {
  id: string
  color: string
  x: number
  y: number
  dx: number
  dy: number
  drift: boolean
}

type GameWithCaptureSlices = {
  state?: {
    moodPins?: {
      pins?: Array<{ emotion?: string }>
      subscribe?: (cb: (pin: { emotion?: string }) => void) => () => void
    }
    captures?: { subscribe?: (cb: () => void) => () => void }
  }
}

export function CaptureFab() {
  const engine = useEngine() as GameWithCaptureSlices | null
  const overlay = useEngineOverlay()
  const [tint, setTint] = useState<string | null>(null)
  const [particles, setParticles] = useState<Particle[]>([])

  const latestMoodColor = useMemo(() => {
    const latest = engine?.state?.moodPins?.pins?.at?.(-1)
    const emotion = latest?.emotion ? EMOTION_BY_ID[latest.emotion] : null
    return emotion?.color ?? null
  }, [engine])

  useEffect(() => {
    if (latestMoodColor && !tint) setTint(latestMoodColor)
  }, [latestMoodColor, tint])

  const emitParticle = useCallback((color: string) => {
    const rail = readCssPx('--width-rail', 64)
    const inset = readCssPx('--inset-frame', 14)
    const worldLeft = rail + inset
    const worldWidth = window.innerWidth - worldLeft - inset
    const x = worldLeft + worldWidth / 2
    const y = window.innerHeight - inset - 42
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const particle: Particle = {
      id,
      color,
      x,
      y,
      dx: 80 + Math.random() * 30,
      dy: -(window.innerHeight * 0.55 + Math.random() * 30),
      drift: false,
    }
    setParticles((items) => [...items, particle])
    window.setTimeout(() => {
      setParticles((items) =>
        items.map((item) => (item.id === id ? { ...item, drift: true } : item)),
      )
    }, 20)
    window.setTimeout(() => {
      setParticles((items) => items.filter((item) => item.id !== id))
    }, 1500)
  }, [])

  useEffect(() => {
    const moodPins = engine?.state?.moodPins
    const captures = engine?.state?.captures
    const offMood = moodPins?.subscribe?.((pin) => {
      const color = (pin.emotion && EMOTION_BY_ID[pin.emotion]?.color) || '#FF8A5C'
      setTint(color)
      emitParticle(color)
    })
    const offCaptures = captures?.subscribe?.(() => emitParticle('#FFFDF6'))
    return () => {
      offMood?.()
      offCaptures?.()
    }
  }, [emitParticle, engine])

  return (
    <>
      <div className="pointer-events-none fixed right-(--inset-frame) bottom-[calc(var(--inset-frame)+18px)] left-[calc(var(--width-rail)+var(--inset-frame))] z-40 flex justify-center">
        <button
          type="button"
          aria-label="Capture"
          data-testid="capture-fab"
          onClick={() => overlay.setActiveChooser(!overlay.activeChooser)}
          className={cn(
            'pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full border border-white/45 px-4',
            'bg-white/86 text-[13px] font-semibold tracking-[0] text-[rgba(43,38,32,0.86)] shadow-[0_14px_36px_rgba(15,18,36,0.22)] backdrop-blur-md',
            'transition-[transform,background,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white',
            'focus-visible:outline-[3px] focus-visible:outline-[rgba(255,138,92,0.7)] focus-visible:outline-offset-[3px]',
            overlay.activeChooser && 'bg-white',
          )}
          style={tint ? { boxShadow: `0 14px 36px ${tint}55` } : undefined}
        >
          {overlay.activeChooser ? (
            <MessageCircle aria-hidden className="size-5" />
          ) : (
            <Plus aria-hidden className="size-5" />
          )}
          <span>capture</span>
        </button>
      </div>
      {particles.map((particle) => (
        <span
          key={particle.id}
          aria-hidden="true"
          className="pointer-events-none fixed z-50 size-2.5 rounded-full opacity-80 transition-[transform,opacity] duration-[1500ms] ease-out"
          style={{
            left: particle.x,
            top: particle.y,
            background: particle.color,
            transform: particle.drift
              ? `translate(${particle.dx}px, ${particle.dy}px) scale(0.6)`
              : 'translate(0, 0) scale(1)',
            opacity: particle.drift ? 0 : 0.8,
          }}
        />
      ))}
    </>
  )
}

function readCssPx(name: string, fallback: number) {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}
