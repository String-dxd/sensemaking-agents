import { Copy, RotateCcw, X } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Vector3 } from 'three'
import {
  DEFAULT_PRESETS,
  hasOverride,
  type PresetMap,
  patchPreset,
  resetPreset,
  type SceneId,
  useCameraPresets,
} from '~/lib/student-space/camera-tuner'
import { cn } from '~/lib/utils'

/**
 * Dev HUD for tuning onboarding camera framings.
 *
 * Opened from the ⌘K dev palette ("Camera tuner" command, only listed during
 * onboarding). A scene selector picks the preset to edit; "Preview" re-issues
 * the camera move against the live engine; "Copy" puts the current values on
 * the clipboard as a JS object literal so they can be pasted back into
 * `camera-tuner.ts`.
 */

export const CAMERA_TUNER_OPEN_EVENT = 'student-space:open-camera-tuner'

type Kira = {
  perchX?: number
  perchY?: number
  perchZ?: number
  perchYaw?: number
}

type CameraLike = {
  zoomTo?: (position: Vector3, lookAt: Vector3, duration: number) => void
  restoreZoom?: (duration: number) => void
  startLandingOrbit?: (opts: {
    azimuthDegPerSec: number
    distance: number
    pitchDeg: number
  }) => void
  stopLandingOrbit?: () => void
}

type FlowersLike = { flowers?: Array<{ x: number; z: number }> }

export type CameraTuneTargets = {
  camera: CameraLike | null | undefined
  kira: Kira | null | undefined
  flowers?: FlowersLike | null | undefined
}

const SCENE_OPTIONS: Array<{ id: SceneId; label: string }> = [
  { id: 'first-chat', label: 'FirstChat — bird portrait' },
  { id: 'closing-portrait', label: 'Closing — bird portrait' },
  { id: 'bloom', label: 'IslandReveal — flower bloom' },
  { id: 'tree-wide', label: 'IslandReveal — tree wide' },
  { id: 'login-orbit', label: 'EdupassLogin — landing orbit' },
]

const FIELD_LABELS: Record<SceneId, Array<{ key: string; label: string; step?: number }>> = {
  'first-chat': [
    { key: 'distance', label: 'Distance', step: 0.1 },
    { key: 'yawOffsetDeg', label: 'Yaw offset (deg)', step: 1 },
    { key: 'camYAboveLookAt', label: 'Camera ↑ above lookAt', step: 0.05 },
    { key: 'lookAtYAbovePerch', label: 'LookAt ↑ above perch', step: 0.05 },
    { key: 'durationMs', label: 'Duration (ms)', step: 50 },
    { key: 'zoomLeadMs', label: 'Zoom lead (ms)', step: 50 },
  ],
  'closing-portrait': [
    { key: 'distance', label: 'Distance', step: 0.1 },
    { key: 'yawOffsetDeg', label: 'Yaw offset (deg)', step: 1 },
    { key: 'camYAboveLookAt', label: 'Camera ↑ above lookAt', step: 0.05 },
    { key: 'lookAtYAbovePerch', label: 'LookAt ↑ above perch', step: 0.05 },
    { key: 'durationMs', label: 'Duration (ms)', step: 50 },
  ],
  bloom: [
    { key: 'camYAboveLookAt', label: 'Camera ↑ above lookAt', step: 0.1 },
    { key: 'camZBack', label: 'Camera Z back', step: 0.1 },
    { key: 'lookAtY', label: 'LookAt Y (absolute)', step: 0.05 },
    { key: 'durationMs', label: 'Duration (ms)', step: 50 },
  ],
  'tree-wide': [
    { key: 'camX', label: 'Camera X', step: 0.1 },
    { key: 'camY', label: 'Camera Y', step: 0.1 },
    { key: 'camZ', label: 'Camera Z', step: 0.1 },
    { key: 'lookAtY', label: 'LookAt Y', step: 0.05 },
    { key: 'durationMs', label: 'Duration (ms)', step: 50 },
  ],
  'login-orbit': [
    { key: 'azimuthDegPerSec', label: 'Azimuth deg/sec', step: 0.5 },
    { key: 'distance', label: 'Distance', step: 0.5 },
    { key: 'pitchDeg', label: 'Pitch (deg)', step: 1 },
  ],
}

function formatNum(value: number): string {
  // Match the readable form people paste into source — no scientific notation.
  if (Number.isInteger(value)) return String(value)
  const fixed = value.toFixed(4)
  return fixed.replace(/0+$/, '').replace(/\.$/, '')
}

function presetToSnippet(sceneId: SceneId, preset: PresetMap[SceneId]): string {
  const entries = Object.entries(preset)
    .map(([k, v]) => `  ${k}: ${formatNum(v as number)},`)
    .join('\n')
  return `'${sceneId}': {\n${entries}\n},`
}

export function CameraTuneHud({ targets }: { targets: CameraTuneTargets | null | undefined }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<SceneId>('first-chat')
  const [toast, setToast] = useState<string | null>(null)
  const presets = useCameraPresets()

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(CAMERA_TUNER_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CAMERA_TUNER_OPEN_EVENT, onOpen)
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

  const preset = presets[selected]
  const fields = FIELD_LABELS[selected]
  const dirty = hasOverride(selected)
  const snippet = useMemo(() => presetToSnippet(selected, preset), [selected, preset])

  const applyPreview = useCallback(() => {
    const camera = targets?.camera
    if (!camera) {
      setToast('Camera not ready')
      return
    }
    switch (selected) {
      case 'first-chat':
      case 'closing-portrait': {
        const kira = targets?.kira
        if (!kira) {
          setToast('Kira not ready — try in onboarding')
          return
        }
        const p = presets[selected]
        const yaw = (kira.perchYaw ?? 0) + (p.yawOffsetDeg * Math.PI) / 180
        const fx = Math.cos(yaw)
        const fz = -Math.sin(yaw)
        const lookAt = new Vector3(
          kira.perchX ?? 0,
          (kira.perchY ?? 0) + p.lookAtYAbovePerch,
          kira.perchZ ?? 0,
        )
        const camPos = new Vector3(
          lookAt.x + fx * p.distance,
          (kira.perchY ?? 0) + p.lookAtYAbovePerch + p.camYAboveLookAt,
          lookAt.z + fz * p.distance,
        )
        camera.zoomTo?.(camPos, lookAt, p.durationMs)
        setToast('Previewing portrait')
        break
      }
      case 'bloom': {
        const flower = targets?.flowers?.flowers?.[0]
        if (!flower) {
          setToast('No flower yet — open IslandReveal')
          return
        }
        const p = presets.bloom
        const lookAt = new Vector3(flower.x, p.lookAtY, flower.z)
        const camPos = new Vector3(flower.x, lookAt.y + p.camYAboveLookAt, flower.z + p.camZBack)
        camera.zoomTo?.(camPos, lookAt, p.durationMs)
        setToast('Previewing bloom')
        break
      }
      case 'tree-wide': {
        const p = presets['tree-wide']
        camera.zoomTo?.(
          new Vector3(p.camX, p.camY, p.camZ),
          new Vector3(0, p.lookAtY, 0),
          p.durationMs,
        )
        setToast('Previewing tree wide')
        break
      }
      case 'login-orbit': {
        const p = presets['login-orbit']
        try {
          camera.stopLandingOrbit?.()
        } catch {
          // Best-effort — orbit may not be active yet.
        }
        camera.startLandingOrbit?.(p)
        setToast('Previewing landing orbit')
        break
      }
    }
  }, [presets, selected, targets])

  const onFieldChange = useCallback(
    (key: string, e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const num = Number(raw)
      if (!Number.isFinite(num)) return
      patchPreset(selected, { [key]: num } as Partial<PresetMap[SceneId]>)
    },
    [selected],
  )

  const copyValues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setToast('Copied snippet')
    } catch {
      // Fallback for restrictive contexts — drop into a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = snippet
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setToast('Copied snippet')
      } catch {
        setToast('Copy failed')
      } finally {
        document.body.removeChild(ta)
      }
    }
  }, [snippet])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Camera tuner"
      className={cn(
        'fixed top-3 right-3 z-[60] w-[320px] pointer-events-auto',
        'rounded-2xl border border-white/15 bg-[rgba(15,18,28,0.86)] text-white',
        'shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-md',
        'p-3 flex flex-col gap-2 text-[12px] leading-tight',
        'motion-reduce:transition-none',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/55">Camera tuner</span>
          {dirty ? (
            <span
              title="This scene has unsaved overrides"
              className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
            >
              edited
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close camera tuner"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded text-white/65 hover:bg-white/10 hover:text-white',
            'focus:outline-none focus:ring-1 focus:ring-white/40',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-white/55">Scene</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as SceneId)}
          className={cn(
            'rounded-md border border-white/15 bg-black/35 px-2 py-1.5 text-white',
            'focus:outline-none focus:ring-1 focus:ring-white/40',
          )}
        >
          {SCENE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-[#0f121c]">
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-1.5">
        {fields.map((field) => {
          const value = (preset as Record<string, number>)[field.key]
          return (
            <label key={field.key} className="grid grid-cols-[1fr_88px] items-center gap-2">
              <span className="text-white/75">{field.label}</span>
              <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                step={field.step ?? 0.1}
                onChange={(e) => onFieldChange(field.key, e)}
                className={cn(
                  'rounded-md border border-white/15 bg-black/35 px-2 py-1 text-right tabular-nums text-white',
                  'focus:outline-none focus:ring-1 focus:ring-white/40',
                )}
              />
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={applyPreview}
          className={cn(
            'rounded-md bg-(--color-onb-accent) px-2.5 py-1.5 text-[12px] font-medium text-white',
            'hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-white/60',
          )}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => void copyValues()}
          title="Copy as JS snippet"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5',
            'text-[12px] text-white hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40',
          )}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <button
          type="button"
          onClick={() => resetPreset(selected)}
          disabled={!dirty}
          title={`Reset ${selected} to default`}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5',
            'text-[12px] text-white hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <span className="ml-auto text-[10px] text-white/45">
          {fields[0]
            ? `default ${formatNum(
                (DEFAULT_PRESETS[selected] as Record<string, number>)[fields[0].key] ?? 0,
              )}`
            : null}
        </span>
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
