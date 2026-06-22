import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { Camera, Vector3 } from 'three'
import { createCommandStack } from './editor/commandStack'
import { downloadSpec, importSpecFromFile } from './editor/exportSpec'
import { clearSaved, createAutosaver, loadSpec } from './editor/persistence'
import { Backdrop } from './scene/Backdrop'
import { CoastlineHandles } from './scene/CoastlineHandles'
import { Sea } from './scene/Sea'
import { Terrain } from './scene/Terrain'
import { applyBrush, type BrushParams } from './terrain/brush'
import { deletePoint, insertPointAfter, movePointTo } from './terrain/coastlineOps'
import {
  CURRENT_SPEC_VERSION,
  type HeightProfile,
  type IslandSpec,
  type ReliefGrid,
  seedFromCurrentIsland,
  type Vec2,
} from './terrain/islandSpec'
import { type EditMode, ToolPanel } from './ui/ToolPanel'

const SAVED = loadSpec()
const INITIAL: IslandSpec = SAVED ?? seedFromCurrentIsland()

const autosave = createAutosaver()

// Mesh resolution: full detail at rest, reduced while a coastline handle is
// being dragged (the field rebuild is the expensive per-move cost). Restored
// on release. DRAG_SEGMENTS is a quality/perf knob — raise if mid-drag looks
// too coarse.
const FULL_SEGMENTS = 80
const DRAG_SEGMENTS = 32

/** Minimal shape of the three OrbitControls instance drei forwards. */
type OrbitControlsLike = { object: Camera; target: Vector3; update: () => void }

export function App() {
  const [mode, setMode] = useState<EditMode>('shape')
  const [coastline, setCoastline] = useState<Vec2[]>(INITIAL.coastline)
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null)
  const [worldSize, setWorldSize] = useState<number>(INITIAL.worldSize)
  const [profile, setProfile] = useState<HeightProfile>(INITIAL.heightProfile)
  const [brush, setBrush] = useState<BrushParams>({ radius: 3, strength: 0.3, mode: 'raise' })
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const [coastlineDragging, setCoastlineDragging] = useState(false)

  // Relief lives in a ref (mutated in place by the brush, cheaply) with a tick
  // to trigger spec recompute — keeps brush dabs out of a React updater so
  // StrictMode's double-invoke can't double-apply a stroke.
  const reliefRef = useRef<ReliefGrid>(INITIAL.relief)
  const [reliefTick, setReliefTick] = useState(0)
  const refreshRelief = useCallback(() => setReliefTick((t) => t + 1), [])
  const brushRef = useRef(brush)
  brushRef.current = brush
  // World size lives in a ref too so the []-dep paint callback isn't stale.
  const worldSizeRef = useRef(worldSize)
  worldSizeRef.current = worldSize

  // Mutable undo/redo history. A version counter forces the undo/redo buttons
  // to re-evaluate canUndo()/canRedo() after each push/undo/redo.
  const stack = useRef(createCommandStack()).current
  const [, setStackVersion] = useState(0)
  const bumpStack = useCallback(() => setStackVersion((v) => v + 1), [])

  const spec: IslandSpec = useMemo(
    () => ({
      version: CURRENT_SPEC_VERSION,
      worldSize,
      coastline,
      heightProfile: profile,
      relief: { resolution: reliefRef.current.resolution, data: reliefRef.current.data },
    }),
    [coastline, profile, worldSize, reliefTick],
  )

  // Latest spec, kept in a ref so command-stack closures and export read the
  // current value without re-subscribing.
  const specRef = useRef(spec)
  specRef.current = spec

  // Autosave on every spec change (debounced internally).
  useEffect(() => {
    autosave(spec)
  }, [spec])

  const movePoint = useCallback((index: number, next: Vec2) => {
    setCoastline((pts) => movePointTo(pts, index, next))
  }, [])

  // ── Coastline drag → one undoable command per drag ──────────────────────────
  const dragBefore = useRef<Vec2[] | null>(null)
  const onDragChange = useCallback(
    (dragging: boolean) => {
      setOrbitEnabled(!dragging)
      setCoastlineDragging(dragging)
      if (dragging) {
        dragBefore.current = specRef.current.coastline
        return
      }
      const before = dragBefore.current
      dragBefore.current = null
      if (!before) return
      const after = specRef.current.coastline
      if (after === before) return // no movement recorded
      stack.push({
        label: 'Move coastline',
        do: () => setCoastline(after),
        undo: () => setCoastline(before),
      })
      bumpStack()
    },
    [stack, bumpStack],
  )

  // ── Insert / delete control points → one undoable command each ───────────────
  const insertAfterSelected = useCallback(() => {
    const at = selectedPoint ?? coastline.length - 1
    const before = specRef.current.coastline
    const after = insertPointAfter(before, at)
    setCoastline(after)
    setSelectedPoint(at + 1)
    stack.push({ label: 'Insert point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [selectedPoint, coastline.length, stack, bumpStack])

  const deleteSelected = useCallback(() => {
    if (selectedPoint === null) return
    const before = specRef.current.coastline
    const after = deletePoint(before, selectedPoint)
    if (after.length === before.length) return // min-3 guard hit
    setCoastline(after)
    setSelectedPoint(null)
    stack.push({ label: 'Delete point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [selectedPoint, stack, bumpStack])

  // ── Numeric edit session → one undoable command per focus→blur ───────────────
  const numericBefore = useRef<Vec2[] | null>(null)
  const onPointFieldFocus = useCallback(() => {
    numericBefore.current = specRef.current.coastline
  }, [])
  const onPointFieldChange = useCallback((index: number, next: Vec2) => {
    if (!Number.isFinite(next.x) || !Number.isFinite(next.z)) return
    setCoastline((pts) => movePointTo(pts, index, next))
  }, [])
  const onPointFieldBlur = useCallback(() => {
    const before = numericBefore.current
    numericBefore.current = null
    if (!before) return
    const after = specRef.current.coastline
    if (after === before) return
    stack.push({ label: 'Edit point', do: () => setCoastline(after), undo: () => setCoastline(before) })
    bumpStack()
  }, [stack, bumpStack])

  // ── Brush stroke → one undoable command per stroke ──────────────────────────
  const strokeBefore = useRef<number[] | null>(null)
  const applyRelief = useCallback(
    (data: number[]) => {
      reliefRef.current = { resolution: reliefRef.current.resolution, data }
      refreshRelief()
    },
    [refreshRelief],
  )
  const onPaintStart = useCallback(() => {
    setOrbitEnabled(false)
    strokeBefore.current = reliefRef.current.data.slice()
  }, [])
  const paint = useCallback((x: number, z: number) => {
    applyBrush(reliefRef.current, worldSizeRef.current, x, z, brushRef.current)
    setReliefTick((t) => t + 1)
  }, [])
  const onPaintEnd = useCallback(() => {
    setOrbitEnabled(true)
    const before = strokeBefore.current
    strokeBefore.current = null
    if (!before) return
    const after = reliefRef.current.data.slice()
    stack.push({
      label: 'Brush stroke',
      do: () => applyRelief(after),
      undo: () => applyRelief(before),
    })
    bumpStack()
  }, [stack, bumpStack, applyRelief])

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (stack.undo()) bumpStack()
  }, [stack, bumpStack])
  const redo = useCallback(() => {
    if (stack.redo()) bumpStack()
  }, [stack, bumpStack])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (inEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // ── Reset / Export / Import ──────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearSaved()
    const fresh = seedFromCurrentIsland()
    reliefRef.current = fresh.relief
    setCoastline(fresh.coastline)
    setSelectedPoint(null)
    setWorldSize(fresh.worldSize)
    setProfile(fresh.heightProfile)
    setReliefTick((t) => t + 1)
    stack.clear()
    bumpStack()
  }, [stack, bumpStack])

  const exportSpec = useCallback(() => {
    downloadSpec(specRef.current)
  }, [])

  const importInputRef = useRef<HTMLInputElement>(null)
  const openImport = useCallback(() => importInputRef.current?.click(), [])
  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // allow re-importing the same file
      if (!file) return
      try {
        const imported = await importSpecFromFile(file)
        reliefRef.current = imported.relief
        setCoastline(imported.coastline)
        setSelectedPoint(null)
        setWorldSize(imported.worldSize)
        setProfile(imported.heightProfile)
        setReliefTick((t) => t + 1)
        stack.clear() // never let undo resurrect pre-import state
        bumpStack()
      } catch (err) {
        alert(`Could not import island: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [stack, bumpStack],
  )

  // ── Top view ──────────────────────────────────────────────────────────────────
  // Capture the three OrbitControls instance drei forwards via a callback ref,
  // narrowed to the minimal shape we touch (no three-stdlib type dependency).
  const controlsRef = useRef<OrbitControlsLike | null>(null)
  const setControls = useCallback((instance: OrbitControlsLike | null) => {
    controlsRef.current = instance
  }, [])
  const topView = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const { object, target } = controls
    const dist = object.position.distanceTo(target)
    object.position.set(target.x, target.y + dist, target.z + 0.001)
    controls.update()
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ position: [14, 11, 14], fov: 50 }}>
        <Backdrop />
        <Sea level={profile.seaLevel} />
        <Terrain
          spec={spec}
          segments={coastlineDragging ? DRAG_SEGMENTS : FULL_SEGMENTS}
          brushRadius={brush.radius}
          sculptActive={mode === 'sculpt'}
          onPaintStart={onPaintStart}
          onPaint={paint}
          onPaintEnd={onPaintEnd}
        />
        {mode === 'shape' && (
          <CoastlineHandles
            points={coastline}
            seaLevel={profile.seaLevel}
            selectedIndex={selectedPoint}
            onSelect={setSelectedPoint}
            onChange={movePoint}
            onDragChange={onDragChange}
          />
        )}
        <OrbitControls ref={setControls} makeDefault enabled={orbitEnabled} />
      </Canvas>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />
      <ToolPanel
        mode={mode}
        onModeChange={setMode}
        profile={profile}
        onProfileChange={setProfile}
        brush={brush}
        onBrushChange={setBrush}
        canUndo={stack.canUndo()}
        canRedo={stack.canRedo()}
        onUndo={undo}
        onRedo={redo}
        onReset={reset}
        onExport={exportSpec}
        onImport={openImport}
        onTopView={topView}
        selectedPos={selectedPoint === null ? null : (coastline[selectedPoint] ?? null)}
        canDelete={coastline.length > 3}
        onPointFieldFocus={onPointFieldFocus}
        onPointFieldChange={(next) => onPointFieldChange(selectedPoint!, next)}
        onPointFieldBlur={onPointFieldBlur}
        onInsertAfter={insertAfterSelected}
        onDeleteSelected={deleteSelected}
        worldSize={worldSize}
        onWorldSizeChange={(v) => { if (Number.isFinite(v) && v > 0) setWorldSize(v) }}
      />
    </div>
  )
}
