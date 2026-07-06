import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { Camera, Vector3 } from 'three'
import { createCommandStack } from './editor/commandStack'
import { clearSaved, createAutosaver, loadSpec } from './editor/persistence'
import { downloadSpec, importSpecFromFile } from './editor/specIO'
import { Backdrop } from './scene/Backdrop'
import {
  DEFAULT_CAMERA,
  dolly,
  orbitAroundY,
  ROTATE_STEP,
  type Vec3,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
} from './scene/cameraOps'
import { IslandTerrain } from './scene/IslandTerrain'
import { SeaSurface } from './scene/SeaSurface'
import { adjustTier, brushCells, setSurface, setTier } from './terrain/gridOps'
import { seedIsland } from './terrain/seed'
import { cellLine, type IslandSpec, SURFACE_AUTO, SURFACE_PATH, worldToCell } from './terrain/terrainGrid'
import { CameraDock } from './ui/CameraDock'
import { FileBar } from './ui/FileBar'
import { type BrushSize, type Tool, ToolPanel } from './ui/ToolPanel'

const SAVED = loadSpec()
const INITIAL: IslandSpec = SAVED ?? seedIsland()

const autosave = createAutosaver()

/** Minimal shape of the three OrbitControls instance drei forwards. */
type OrbitControlsLike = { object: Camera; target: Vector3; update: () => void }

export function App() {
  const [tool, setTool] = useState<Tool>('raise')
  const [brushSize, setBrushSize] = useState<BrushSize>(1)
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  // Hold-Space: drags orbit the camera instead of painting.
  const [cameraMode, setCameraMode] = useState(false)

  // The spec lives in a ref (its grid arrays mutated in place by grid ops) with
  // a tick to trigger recompute — keeps stamp application out of a React
  // updater so StrictMode's double-invoke can't double-apply a stroke.
  const specRef = useRef<IslandSpec>(INITIAL)
  const [gridTick, setGridTick] = useState(0)
  const toolRef = useRef(tool)
  toolRef.current = tool
  const brushSizeRef = useRef(brushSize)
  brushSizeRef.current = brushSize

  // Mutable undo/redo history. A version counter forces the undo/redo buttons
  // to re-evaluate canUndo()/canRedo() after each push/undo/redo.
  const stack = useRef(createCommandStack()).current
  const [, setStackVersion] = useState(0)
  const bumpStack = useCallback(() => setStackVersion((v) => v + 1), [])

  // A fresh spec identity per tick so scene consumers recompute.
  const spec: IslandSpec = useMemo(
    () => ({ ...specRef.current }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: gridTick IS the dependency signal
    [gridTick],
  )

  // Autosave on every spec change (debounced internally).
  useEffect(() => {
    autosave(spec)
  }, [spec])

  // ── Stroke lifecycle: one undoable command per stroke ───────────────────────
  // Snapshot both layers on paint-start; each stroke touches a cell at most once
  // (the visited set prevents runaway raises while dragging inside one cell).
  const strokeBefore = useRef<{ tiers: number[]; surface: number[] } | null>(null)
  const visited = useRef<Set<number>>(new Set())
  // Last cell painted this stroke, so a fast drag interpolates a continuous
  // line between pointer samples instead of leaving gaps (null = stroke start).
  const lastCell = useRef<{ c: number; r: number } | null>(null)

  const applySnapshot = useCallback((tiers: number[], surface: number[]) => {
    const grid = specRef.current.grid
    grid.tiers = tiers.slice()
    grid.surface = surface.slice()
    setGridTick((t) => t + 1)
  }, [])

  const onPaintStart = useCallback(() => {
    setOrbitEnabled(false)
    const grid = specRef.current.grid
    strokeBefore.current = { tiers: grid.tiers.slice(), surface: grid.surface.slice() }
    visited.current.clear()
    lastCell.current = null
  }, [])

  const paint = useCallback((x: number, z: number) => {
    const s = specRef.current
    const grid = s.grid
    const { c, r } = worldToCell(s.worldSize, grid, x, z)
    // Interpolate from the previous sample so a fast drag paints every cell on
    // the path, not just where pointer events happened to fire. brushCells
    // clips out-of-bounds cells; the visited set keeps each cell single-touch.
    const last = lastCell.current
    const path = last ? cellLine(last.c, last.r, c, r) : [{ c, r }]
    lastCell.current = { c, r }
    const cellSet = new Set<number>()
    for (const p of path) {
      for (const i of brushCells(grid, p.c, p.r, brushSizeRef.current)) {
        if (!visited.current.has(i)) cellSet.add(i)
      }
    }
    const cells = [...cellSet]
    if (cells.length === 0) return
    for (const i of cells) visited.current.add(i)
    switch (toolRef.current) {
      case 'raise':
        adjustTier(grid, cells, +1)
        break
      case 'lower':
        adjustTier(grid, cells, -1)
        break
      case 'water':
        setTier(grid, cells, 0)
        break
      case 'path':
        setSurface(grid, cells, SURFACE_PATH)
        break
      case 'erase':
        setSurface(grid, cells, SURFACE_AUTO)
        break
    }
    setGridTick((t) => t + 1)
  }, [])

  const onPaintEnd = useCallback(() => {
    setOrbitEnabled(true)
    const before = strokeBefore.current
    strokeBefore.current = null
    if (!before || visited.current.size === 0) return
    const grid = specRef.current.grid
    const after = { tiers: grid.tiers.slice(), surface: grid.surface.slice() }
    stack.push({
      label: 'Stroke',
      do: () => applySnapshot(after.tiers, after.surface),
      undo: () => applySnapshot(before.tiers, before.surface),
    })
    bumpStack()
  }, [stack, bumpStack, applySnapshot])

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

  // ── Hold-Space to orbit ───────────────────────────────────────────────────────
  // While Space is held, drags fall through to OrbitControls (see IslandTerrain's
  // cameraMode guard). blur clears it so a lost focus can't leave it stuck on.
  useEffect(() => {
    const inEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return (
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || inEditable(e.target)) return
      e.preventDefault() // stop the page from scrolling on Space
      setCameraMode(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setCameraMode(false)
    }
    const onBlur = () => setCameraMode(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ── Reset / Export / Import ──────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearSaved()
    specRef.current = seedIsland()
    setGridTick((t) => t + 1)
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
        specRef.current = await importSpecFromFile(file)
        setGridTick((t) => t + 1)
        stack.clear() // never let undo resurrect pre-import state
        bumpStack()
      } catch (err) {
        alert(`Could not import island: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [stack, bumpStack],
  )

  // ── Camera presets ────────────────────────────────────────────────────────────
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
  // The elevated ~52° three-quarter view the sandbox games use.
  const designerView = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const { object, target } = controls
    const dist = object.position.distanceTo(target)
    object.position.set(target.x, target.y + dist * 0.79, target.z + dist * 0.61)
    controls.update()
  }, [])

  // ── Camera nudges (dock buttons) ──────────────────────────────────────────────
  // Apply a pure cameraOps transform to the live OrbitControls position.
  const nudge = useCallback((next: (p: Vec3, t: Vec3) => Vec3) => {
    const c = controlsRef.current
    if (!c) return
    const p = next(
      { x: c.object.position.x, y: c.object.position.y, z: c.object.position.z },
      { x: c.target.x, y: c.target.y, z: c.target.z },
    )
    c.object.position.set(p.x, p.y, p.z)
    c.update()
  }, [])
  const zoomIn = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_IN_FACTOR)), [nudge])
  const zoomOut = useCallback(() => nudge((p, t) => dolly(p, t, ZOOM_OUT_FACTOR)), [nudge])
  const rotateLeft = useCallback(() => nudge((p, t) => orbitAroundY(p, t, ROTATE_STEP)), [nudge])
  const rotateRight = useCallback(() => nudge((p, t) => orbitAroundY(p, t, -ROTATE_STEP)), [nudge])
  const recenter = useCallback(() => {
    const c = controlsRef.current
    if (!c) return
    c.target.set(0, 0, 0)
    c.object.position.set(DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z)
    c.update()
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas camera={{ position: [14, 11, 14], fov: 50 }}>
        <Backdrop />
        <SeaSurface key={`${spec.grid.cols}x${spec.grid.rows}`} spec={spec} />
        <IslandTerrain
          spec={spec}
          brushSize={brushSize}
          cameraMode={cameraMode}
          onPaintStart={onPaintStart}
          onPaint={paint}
          onPaintEnd={onPaintEnd}
        />
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
        tool={tool}
        onToolChange={setTool}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        canUndo={stack.canUndo()}
        canRedo={stack.canRedo()}
        onUndo={undo}
        onRedo={redo}
      />
      <CameraDock
        onDesignerView={designerView}
        onTopView={topView}
        onRotateLeft={rotateLeft}
        onRotateRight={rotateRight}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onRecenter={recenter}
      />
      <FileBar onExport={exportSpec} onImport={openImport} onReset={reset} />
    </div>
  )
}
