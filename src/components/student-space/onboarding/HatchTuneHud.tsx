import { Copy, Play, RotateCcw, X } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { EGG_COLOR_BY_ID, EGG_COLORS } from '~/engine/student-space/Game/View/Onboarding/copy.js'
import {
  DEFAULT_HATCH_PRESET,
  type HatchPreset,
  hasHatchOverride,
  patchHatchPreset,
  resetHatchPreset,
  useHatchPreset,
} from '~/lib/student-space/hatch-tuner'
import { cn } from '~/lib/utils'
import { EggCanvas, HATCH_TUNER_REPLAY_EVENT } from './EggHatcher'

/**
 * Dev HUD for tuning the egg-hatch animation.
 *
 * Opened from the Cmd+K dev palette. Sliders/number inputs adjust the
 * bird's start/reveal Y, scale, and the camera FOV + distance — the
 * embedded EggCanvas preview re-mounts on each Replay click so the new
 * values take effect. "Copy" emits a JS object literal that can be
 * pasted back into `hatch-tuner.ts`'s DEFAULT_HATCH_PRESET.
 */

export const HATCH_TUNER_OPEN_EVENT = 'student-space:open-hatch-tuner'

type FieldDef = {
  key: keyof HatchPreset
  label: string
  min: number
  max: number
  step: number
}

const FIELDS: FieldDef[] = [
  { key: 'birdStartY', label: 'Bird start Y', min: -1.2, max: 0.4, step: 0.05 },
  { key: 'birdRevealY', label: 'Bird reveal Y', min: -1.2, max: 0.4, step: 0.05 },
  { key: 'birdScale', label: 'Bird scale', min: 0.15, max: 0.9, step: 0.01 },
  { key: 'cameraFov', label: 'Camera FOV (°)', min: 14, max: 60, step: 1 },
  { key: 'cameraDistance', label: 'Camera distance', min: 2.5, max: 9, step: 0.1 },
]

function formatNum(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function presetToSnippet(preset: HatchPreset): string {
  const entries = Object.entries(preset)
    .map(([k, v]) => `  ${k}: ${formatNum(v as number)},`)
    .join('\n')
  return `export const DEFAULT_HATCH_PRESET = Object.freeze({\n${entries}\n})`
}

export function HatchTuneHud() {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [previewColorId, setPreviewColorId] = useState<string>('masked')
  const [previewKey, setPreviewKey] = useState(0)
  const preset = useHatchPreset()
  const dirty = hasHatchOverride()
  const snippet = useMemo(() => presetToSnippet(preset), [preset])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(HATCH_TUNER_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(HATCH_TUNER_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 1400)
    return () => window.clearTimeout(id)
  }, [toast])

  const onFieldChange = useCallback((key: keyof HatchPreset, e: ChangeEvent<HTMLInputElement>) => {
    const num = Number(e.target.value)
    if (!Number.isFinite(num)) return
    patchHatchPreset({ [key]: num } as Partial<HatchPreset>)
  }, [])

  const replay = useCallback(() => {
    setPreviewKey((k) => k + 1)
    // Also notify any live EggCanvas instances in the onboarding flow.
    window.dispatchEvent(new Event(HATCH_TUNER_REPLAY_EVENT))
    setToast('Replayed')
  }, [])

  const copyValues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setToast('Copied snippet')
    } catch {
      setToast('Copy failed')
    }
  }, [snippet])

  const onReset = useCallback(() => {
    resetHatchPreset()
    setPreviewKey((k) => k + 1)
    setToast('Reset to defaults')
  }, [])

  const previewColor = EGG_COLOR_BY_ID[previewColorId]?.hex ?? '#5A4CB8'

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Hatch tuner"
      className={cn(
        'fixed top-3 right-3 z-[60] w-[360px] pointer-events-auto',
        'rounded-2xl border border-white/15 bg-[rgba(15,18,28,0.86)] text-white',
        'shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-md',
        'p-3 flex flex-col gap-3 text-[12px] leading-tight',
        'motion-reduce:transition-none',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-white/55">Hatch tuner</span>
          {dirty ? (
            <span
              title="Unsaved overrides — copy snippet to persist"
              className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
            >
              edited
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close hatch tuner"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded text-white/65 hover:bg-white/10 hover:text-white',
            'focus:outline-none focus:ring-1 focus:ring-white/40',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Preview canvas — its own EggCanvas instance with hatching=true. Each
          Replay click bumps `previewKey`, remounting the canvas so the new
          tuner values are read on init. */}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[rgba(250,242,227,1)]">
        <div className="grid h-[260px] w-full place-items-center">
          <EggCanvas
            key={`hatch-tuner-${previewKey}`}
            color={previewColor}
            reducedMotion={false}
            speciesId={previewColorId}
            hatching
          />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-white/55">Egg color (preview)</span>
        <select
          value={previewColorId}
          onChange={(e) => {
            setPreviewColorId(e.target.value)
            setPreviewKey((k) => k + 1)
          }}
          className={cn(
            'rounded-md border border-white/15 bg-black/35 px-2 py-1.5 text-white',
            'focus:outline-none focus:ring-1 focus:ring-white/40',
          )}
        >
          {EGG_COLORS.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#0f121c]">
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-2">
        {FIELDS.map((field) => {
          const value = preset[field.key]
          const defaultValue = DEFAULT_HATCH_PRESET[field.key]
          const isDefault = Math.abs(value - defaultValue) < 1e-6
          return (
            <div key={field.key} className="grid grid-cols-[1fr_60px] items-center gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-white/75">{field.label}</span>
                  {!isDefault ? (
                    <span className="text-[10px] text-amber-200/80">
                      default {formatNum(defaultValue)}
                    </span>
                  ) : null}
                </div>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value}
                  onChange={(e) => onFieldChange(field.key, e)}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-(--color-onb-accent)"
                />
              </div>
              <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                step={field.step}
                onChange={(e) => onFieldChange(field.key, e)}
                className={cn(
                  'rounded-md border border-white/15 bg-black/35 px-2 py-1 text-right tabular-nums text-white',
                  'focus:outline-none focus:ring-1 focus:ring-white/40',
                )}
              />
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={replay}
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-(--color-onb-accent) px-2.5 py-1.5 text-[12px] font-medium text-white',
            'hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-white/60 active:scale-[0.96]',
          )}
        >
          <Play className="h-3.5 w-3.5" /> Replay
        </button>
        <button
          type="button"
          onClick={() => void copyValues()}
          title="Copy as JS snippet"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5',
            'text-[12px] text-white hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40 active:scale-[0.96]',
          )}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty}
          title="Reset all to defaults"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5',
            'text-[12px] text-white hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40 active:scale-[0.96]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <details className="group rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
        <summary className="cursor-pointer list-none text-[11px] text-white/65 group-open:text-white/85">
          Snippet
        </summary>
        <pre className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-1.5 text-[11px] text-white/80">
          {snippet}
        </pre>
      </details>

      {toast ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute -bottom-7 right-0 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white shadow-md"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
