import {
  CloudRain,
  Gauge,
  Music2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Hud } from '~/components/ui/hud'
import { STATUS_IDS, statusLabelOf } from '~/engine/student-space/Game/View/statusHeuristics.js'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { useWorldControlsVisible } from '~/lib/student-space/world-controls-visibility'
import { cn } from '~/lib/utils'

const RAIN_STOPPED_LINES = [
  'The rain just lifted. Anything feel different out there?',
  "It's gone quiet. What did you carry in with you?",
  'The drops stopped. A small thing - capture it before it slips.',
]

const CCA_FINISHED_LINES = [
  'You just came in from something. One vivid bit - anything stuck?',
  "Practice just wrapped, didn't it? What's still humming?",
  'Capture one moment from out there before it fades.',
]

const ZOOM_STEP_IN = 0.85
const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN

const SPECIES = [
  { id: 'flame', displayName: 'Flame Bower', accent: '#ffb347' },
  { id: 'masked', displayName: 'Masked Bower', accent: '#ff8c42' },
  { id: 'regent', displayName: 'Regent Bower', accent: '#f4a261' },
  { id: 'emerald', displayName: 'Emerald Bower', accent: '#f4e07a' },
  { id: 'satin', displayName: 'Satin Bower', accent: '#5fb8ff' },
  { id: 'twilight', displayName: 'Twilight Bower', accent: '#9a8aff' },
  { id: 'lilac', displayName: 'Lilac Bower', accent: '#c08ee8' },
]

const STATUS_DOT_CLASS: Record<string, string> = {
  auto: 'bg-white/45',
  starter: 'bg-amber-400',
  diffused: 'bg-orange-500',
  searching: 'bg-blue-500',
  foreclosed: 'bg-rose-500',
  achieved: 'bg-emerald-500',
}

export type GameLike = {
  state?: {
    day?: {
      hour?: number
      manualHour?: number | null
      setManualHour?: (hour: number) => void
      clearManualHour?: () => void
    }
    weather?: {
      rainTarget?: number
      start?: (intensity?: number) => void
      stop?: () => void
    }
    performance?: {
      smoothedFrameMs?: number
      tier?: string
    }
    time?: {
      delta?: number
      elapsed?: number
    }
    identityStatusOverride?: {
      current?: string | null
      setOverride?: (status: string | null) => void
      subscribe?: (cb: () => void) => () => void
    }
  }
  view?: {
    camera?: {
      zoomBy?: (amount: number) => void
      resetToDefault?: () => void
    }
    sound?: SoundLike
    aurora?: ForceableSky
    rainbow?: ForceableSky
    kira?: {
      speciesId?: string
      cycleSpecies?: (delta: number) => void
      onSpeciesChange?: (cb: (id: string) => void) => () => void
    }
    kiraDialogue?: {
      say?: (line: string) => void
    }
  }
}

type ForceableSky = {
  force?: boolean
  setForce?: (on: boolean) => void
}

type SoundTrack = {
  id: string
  name: string
  attribution?: string
}

type SoundLike = {
  muted?: boolean
  trackId?: string
  tracks?: SoundTrack[]
  toggleMuted?: () => void
  cycleTrack?: (delta: number) => void
  onMuteChange?: (cb: (muted: boolean) => void) => () => void
  onTrackChange?: (cb: (id: string) => void) => () => void
}

export function StudentSpaceHud({ game }: { game: unknown }) {
  const { isOnboarding } = useEngineOverlay()
  const [visible, setVisible] = useWorldControlsVisible()
  if (isOnboarding) return null
  const typedGame = game as GameLike

  return (
    <>
      <ZoomHud game={typedGame} />
      {visible ? (
        <WorldControlsPanel game={typedGame} onClose={() => setVisible(false)} />
      ) : (
        <WorldControlsToggle onToggle={() => setVisible(true)} />
      )}
    </>
  )
}

function WorldControlsToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="fixed top-[calc(var(--inset-frame)+12px)] right-[calc(var(--inset-frame)+12px)] z-30">
      <WorldIconButton label="Show world controls" onClick={onToggle}>
        <SlidersHorizontal aria-hidden className="size-4" />
      </WorldIconButton>
    </div>
  )
}

function WorldControlsPanel({ game, onClose }: { game: GameLike; onClose: () => void }) {
  return (
    <Hud
      dock="top-right"
      role="group"
      aria-label="World controls"
      className="flex w-[min(252px,calc(100vw-var(--width-rail)-44px))] flex-col gap-2 rounded-2xl border border-white/14 bg-black/52 p-2.5 text-white shadow-2xl shadow-black/24 backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-2 pl-1">
        <FpsOverlay game={game} inline />
        <button
          type="button"
          aria-label="Hide world controls"
          onClick={onClose}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/12 hover:text-white"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </header>
      <EnvironmentHud game={game} compact />
      <div className="flex flex-col gap-1.5">
        <TrackPicker game={game} compact />
        <BirdPicker game={game} compact />
      </div>
    </Hud>
  )
}

export function EnvironmentHud({
  game,
  inline = false,
  compact = false,
}: {
  game: GameLike
  inline?: boolean
  compact?: boolean
}) {
  const [snapshot, setSnapshot] = useState(() => readEnvironmentSnapshot(game))
  const refresh = useCallback(() => setSnapshot(readEnvironmentSnapshot(game)), [game])

  useEffect(refresh, [refresh])
  useTicker(refresh, 250)

  const say = useCallback(
    (line: string) => {
      game.view?.kiraDialogue?.say?.(line)
    },
    [game],
  )

  const toggleSky = (key: 'aurora' | 'rainbow') => {
    const module = game.view?.[key]
    if (!module?.setForce) return
    const next = !module.force
    module.setForce(next)
    refresh()
    if (next) say(pick(CCA_FINISHED_LINES))
  }

  const toggleRain = () => {
    const weather = game.state?.weather
    if (!weather) return
    const wasOn = (weather.rainTarget ?? 0) > 0.05
    if (wasOn) weather.stop?.()
    else weather.start?.(0.65)
    refresh()
    if (wasOn) say(pick(RAIN_STOPPED_LINES))
  }

  const content = (
    <>
      <label className="grid grid-cols-[38px_1fr_34px] items-center gap-2">
        <span className="text-[9px] font-semibold text-white/58">hour</span>
        <input
          type="range"
          min="0"
          max="24"
          step="0.1"
          value={snapshot.hour.toFixed(1)}
          onChange={(event) => {
            const hour = Number.parseFloat(event.currentTarget.value)
            game.state?.day?.setManualHour?.(hour)
            setSnapshot((current) => ({ ...current, hour, manualHour: hour }))
          }}
          className="h-2 cursor-pointer accent-[var(--color-onb-accent)]"
        />
        <span className="text-right font-mono text-[10px] tabular-nums text-white/74">
          {snapshot.hour.toFixed(1)}
        </span>
      </label>

      <button
        type="button"
        onClick={() => {
          game.state?.day?.clearManualHour?.()
          refresh()
        }}
        data-active={snapshot.manualHour === null || undefined}
        className="inline-flex h-7 cursor-pointer items-center justify-center rounded-full border border-white/14 bg-white/10 px-3 text-[10px] font-semibold text-white/76 transition-[transform,background-color,border-color,color] data-[active]:border-white/28 data-[active]:bg-white/22 data-[active]:text-white hover:bg-white/18 active:scale-[0.96]"
      >
        use real time
      </button>

      <div className="h-px bg-white/14" />
      <div className="grid gap-1.5">
        <EnvironmentSwitch
          label="rain"
          active={snapshot.rainOn}
          tone="rain"
          icon={<CloudRain className="size-3.5" aria-hidden />}
          onClick={toggleRain}
        />
        <EnvironmentSwitch
          label="aurora"
          active={snapshot.auroraOn}
          tone="aurora"
          icon={<Sparkles className="size-3.5" aria-hidden />}
          onClick={() => toggleSky('aurora')}
        />
        <EnvironmentSwitch
          label="rainbow"
          active={snapshot.rainbowOn}
          tone="rainbow"
          icon={<Sparkles className="size-3.5" aria-hidden />}
          onClick={() => toggleSky('rainbow')}
        />
      </div>
    </>
  )

  if (compact) {
    return (
      <fieldset className="flex w-full flex-col gap-3 text-xs text-white">
        <legend className="sr-only">Environment controls</legend>
        {content}
      </fieldset>
    )
  }

  if (inline) {
    return (
      <fieldset className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-black/10 bg-black/72 p-4 text-xs text-white shadow-xl shadow-black/10">
        <legend className="sr-only">Environment controls</legend>
        {content}
      </fieldset>
    )
  }

  return (
    <Hud
      dock="top-right"
      aria-label="Environment controls"
      className="flex w-[min(260px,calc(100vw-var(--width-rail)-44px))] flex-col gap-3 rounded-2xl border border-white/16 bg-black/42 p-4 text-xs text-white/88 shadow-2xl shadow-black/25 backdrop-blur-md"
    >
      {content}
    </Hud>
  )
}

function EnvironmentSwitch({
  label,
  active,
  tone,
  icon,
  onClick,
}: {
  label: string
  active: boolean
  tone: 'rain' | 'aurora' | 'rainbow'
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      data-active={active || undefined}
      data-tone={tone}
      className={cn(
        'grid h-8 cursor-pointer grid-cols-[1fr_42px] items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 text-left transition-[transform,background-color,border-color] hover:bg-white/14 active:scale-[0.98]',
        'data-[active]:border-white/20 data-[active]:bg-white/16',
      )}
    >
      <span className="inline-flex items-center gap-2 text-[10px] font-semibold text-white/72">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'relative h-[22px] rounded-full bg-white/14 transition',
          active && tone === 'rain' && 'bg-sky-300/46',
          active && tone === 'aurora' && 'bg-violet-300/50',
          active && tone === 'rainbow' && 'bg-emerald-300/48',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform',
            active && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}

function ZoomHud({ game }: { game: GameLike }) {
  const [muted, setMuted] = useState(() => !!game.view?.sound?.muted)

  useEffect(() => {
    const sound = game.view?.sound
    setMuted(!!sound?.muted)
    return sound?.onMuteChange?.((next) => setMuted(next))
  }, [game])

  const dispatch = useCallback(
    (action: 'zoom-in' | 'zoom-out' | 'reset' | 'sound') => {
      const view = game.view
      if (action === 'zoom-in') view?.camera?.zoomBy?.(ZOOM_STEP_IN)
      if (action === 'zoom-out') view?.camera?.zoomBy?.(ZOOM_STEP_OUT)
      if (action === 'reset') view?.camera?.resetToDefault?.()
      if (action === 'sound') view?.sound?.toggleMuted?.()
    },
    [game],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.key === '+' || event.key === '=') {
        dispatch('zoom-in')
        event.preventDefault()
      } else if (event.key === '-' || event.key === '_') {
        dispatch('zoom-out')
        event.preventDefault()
      } else if (event.key === '0') {
        dispatch('reset')
        event.preventDefault()
      } else if (event.key === 'm' || event.key === 'M') {
        dispatch('sound')
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  return (
    <div className="fixed right-[calc(var(--inset-frame)+12px)] bottom-[calc(var(--inset-frame)+16px)] z-30 flex flex-col gap-2">
      <WorldIconButton label="Zoom in" onClick={() => dispatch('zoom-in')}>
        <ZoomIn aria-hidden className="size-4" />
      </WorldIconButton>
      <WorldIconButton label="Zoom out" onClick={() => dispatch('zoom-out')}>
        <ZoomOut aria-hidden className="size-4" />
      </WorldIconButton>
      <WorldIconButton label="Reset view" onClick={() => dispatch('reset')}>
        <RotateCcw aria-hidden className="size-4" />
      </WorldIconButton>
      <WorldIconButton label="Toggle sound" pressed={!muted} onClick={() => dispatch('sound')}>
        {muted ? (
          <VolumeX aria-hidden className="size-4" />
        ) : (
          <Volume2 aria-hidden className="size-4" />
        )}
      </WorldIconButton>
    </div>
  )
}

export interface WorldIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  pressed?: boolean
  children: ReactNode
}

export function WorldIconButton({
  label,
  pressed,
  className,
  children,
  ...props
}: WorldIconButtonProps) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-pressed={pressed || undefined}
      className={cn(
        'grid size-11 cursor-pointer place-items-center rounded-full border border-white/72 bg-white/82 text-[#2b2620] shadow-lg shadow-black/18 backdrop-blur-md transition-[transform,background-color,border-color,color,box-shadow] hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-[0.96]',
        'data-[pressed]:border-white/80 data-[pressed]:bg-[#3B5A2B] data-[pressed]:text-[#FFFBE6]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function StatusPreviewHud({
  game,
  inline = false,
  compact = false,
}: {
  game: GameLike
  inline?: boolean
  compact?: boolean
}) {
  const hidden = useBodyClassPresent('is-dev-overlay-hidden')
  const override = game.state?.identityStatusOverride
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(() => override?.current ?? null)

  useEffect(() => {
    setCurrent(override?.current ?? null)
    return override?.subscribe?.(() => setCurrent(override.current ?? null))
  }, [override])

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('[data-status-preview-root]')) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if ((!inline && hidden) || !override) return null

  const currentKey = current ?? 'auto'
  return (
    <div
      data-status-preview-root
      className={cn(
        'text-white',
        inline
          ? 'relative'
          : 'fixed top-[calc(var(--inset-frame)+12px)] left-[calc(var(--width-rail)+var(--inset-frame)+12px)] z-40',
        compact ? 'w-full' : 'w-44',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left transition-[transform,background-color,border-color] active:scale-[0.98]',
          compact
            ? 'min-h-12 border-white/10 bg-white/8 py-1.5 hover:bg-white/14'
            : 'border-white/16 bg-black/46 shadow-xl shadow-black/20 backdrop-blur-md hover:bg-black/54',
        )}
      >
        <span className="min-w-0">
          <span className="block text-[8px] font-semibold text-white/56">preview as</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-white/88">
            <StatusDot status={currentKey} />
            {current ? statusLabelOf(current) : 'Auto'}
          </span>
        </span>
        <span
          aria-hidden
          className={cn('text-white/50 transition-transform', open && 'rotate-180')}
        >
          v
        </span>
      </button>
      {open ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-white/14 bg-black/72 p-1 shadow-2xl shadow-black/24">
          {[null, ...STATUS_IDS].map((id) => {
            const key = id ?? 'auto'
            const selected = key === currentKey
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    override.setOverride?.(id)
                    setOpen(false)
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-white/78 transition-colors hover:bg-white/10 data-[selected]:bg-white/14 data-[selected]:text-white"
                  data-selected={selected || undefined}
                >
                  <StatusDot status={key} />
                  <span className="min-w-0 flex-1 truncate">
                    {id ? statusLabelOf(id) : 'Auto (real)'}
                  </span>
                  {selected ? <span aria-hidden>✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full', STATUS_DOT_CLASS[status] ?? 'bg-white/45')}
    />
  )
}

function FpsOverlay({ game, inline = false }: { game: GameLike; inline?: boolean }) {
  const hidden = useBodyClassPresent('is-dev-overlay-hidden')
  const [snapshot, setSnapshot] = useState(() => readFpsSnapshot(game))
  const refresh = useCallback(() => setSnapshot(readFpsSnapshot(game)), [game])
  useTicker(refresh, 250)

  if (!inline && hidden) return null

  return (
    <div
      role="status"
      aria-label="Frames per second"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-white/74',
        inline ? 'px-1 py-0.5' : 'border border-white/12 bg-black/28 px-3 py-1.5',
      )}
    >
      <Gauge aria-hidden className="size-3 text-white/44" />
      <span className="font-mono text-[11px] leading-none font-semibold tabular-nums text-white">
        {snapshot.fps}
      </span>
      <span className="text-[10px] text-white/52">
        {snapshot.tier ? `fps · ${snapshot.tier}` : 'fps'}
      </span>
    </div>
  )
}

export function TrackPicker({
  game,
  inline = false,
  compact = false,
}: {
  game: GameLike
  inline?: boolean
  compact?: boolean
}) {
  const sound = game.view?.sound
  const [trackId, setTrackId] = useState(() => sound?.trackId ?? '')

  useEffect(() => {
    setTrackId(sound?.trackId ?? '')
    return sound?.onTrackChange?.((id) => setTrackId(id))
  }, [sound])

  if (!sound) return null
  const track = sound.tracks?.find((item) => item.id === trackId) ?? sound.tracks?.[0]

  return (
    <button
      type="button"
      aria-label="Cycle through ambient music tracks"
      onClick={() => sound.cycleTrack?.(1)}
      onContextMenu={(event) => {
        event.preventDefault()
        sound.cycleTrack?.(-1)
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-left text-white transition-transform hover:-translate-y-0.5 active:translate-y-0',
        compact
          ? 'w-full rounded-2xl border-white/10 bg-white/8 hover:bg-white/14'
          : 'max-w-[220px] rounded-full border-white/14 bg-black/44 shadow-lg shadow-black/18 backdrop-blur-md hover:bg-black/54',
        !compact &&
          (inline
            ? 'relative'
            : 'fixed bottom-[calc(var(--inset-frame)+76px)] left-[calc(var(--width-rail)+var(--inset-frame)+12px)] z-30'),
      )}
    >
      <Music2 aria-hidden className="size-4 shrink-0 text-white/66" />
      <span className="min-w-0">
        <span className="block text-[8px] font-semibold text-white/54">Music</span>
        <span className="block truncate text-[11px] font-semibold text-white/88">
          {track?.name ?? 'Ambient'}
        </span>
        {track?.attribution ? (
          <span className="block truncate text-[10px] text-white/52">{track.attribution}</span>
        ) : null}
      </span>
      <span aria-hidden className="ml-auto text-white/46">
        ↻
      </span>
    </button>
  )
}

export function BirdPicker({
  game,
  inline = false,
  compact = false,
}: {
  game: GameLike
  inline?: boolean
  compact?: boolean
}) {
  const kira = game.view?.kira
  const [speciesId, setSpeciesId] = useState(() => kira?.speciesId ?? 'flame')

  useEffect(() => {
    setSpeciesId(kira?.speciesId ?? 'flame')
    return kira?.onSpeciesChange?.((id) => setSpeciesId(id))
  }, [kira])

  if (!kira) return null
  const species = SPECIES.find((item) => item.id === speciesId) ?? SPECIES[0]

  return (
    <button
      type="button"
      aria-label="Cycle through bird companions"
      onClick={() => kira.cycleSpecies?.(1)}
      onContextMenu={(event) => {
        event.preventDefault()
        kira.cycleSpecies?.(-1)
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-left text-white transition-transform hover:-translate-y-0.5 active:translate-y-0',
        compact
          ? 'w-full rounded-2xl border-white/10 bg-white/8 hover:bg-white/14'
          : 'max-w-[220px] rounded-full border-white/14 bg-black/44 shadow-lg shadow-black/18 backdrop-blur-md hover:bg-black/54',
        !compact &&
          (inline
            ? 'relative'
            : 'fixed bottom-[calc(var(--inset-frame)+26px)] left-[calc(var(--width-rail)+var(--inset-frame)+12px)] z-30'),
      )}
    >
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
        style={{ background: species?.accent }}
      />
      <span className="min-w-0">
        <span className="block text-[8px] font-semibold text-white/54">Try</span>
        <span className="block truncate text-[11px] font-semibold text-white/88">
          {species?.displayName ?? 'Flame Bower'}
        </span>
      </span>
      <span aria-hidden className="ml-auto text-white/46">
        ↻
      </span>
    </button>
  )
}

function readEnvironmentSnapshot(game: GameLike) {
  const day = game.state?.day
  const weather = game.state?.weather
  return {
    hour: day?.hour ?? 0,
    manualHour: day?.manualHour ?? null,
    rainOn: (weather?.rainTarget ?? 0) > 0.05,
    auroraOn: !!game.view?.aurora?.force,
    rainbowOn: !!game.view?.rainbow?.force,
  }
}

function readFpsSnapshot(game: GameLike) {
  const frameMs =
    game.state?.performance?.smoothedFrameMs ?? (game.state?.time?.delta ?? 1 / 60) * 1000
  return {
    fps: Math.max(0, Math.round(1000 / Math.max(1, frameMs))),
    tier: game.state?.performance?.tier ?? '',
  }
}

function useTicker(callback: () => void, intervalMs: number) {
  useEffect(() => {
    let frame = 0
    let last = -Infinity
    const loop = (now: number) => {
      if (now - last >= intervalMs) {
        last = now
        callback()
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [callback, intervalMs])
}

function useBodyClassPresent(className: string) {
  const [present, setPresent] = useState(() =>
    typeof document === 'undefined' ? false : document.body.classList.contains(className),
  )

  useEffect(() => {
    const body = document.body
    const sync = () => setPresent(body.classList.contains(className))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [className])

  return present
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0] ?? ''
}
