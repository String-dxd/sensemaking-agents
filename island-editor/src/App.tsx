import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { MOUSE } from 'three'
import type { Camera, Vector3 } from 'three'
import { createCommandStack } from './editor/commandStack'
import { clearSaved, createAutosaver, loadSpec } from './editor/persistence'
import { loadSpecFromRepo, saveSpecToRepo } from './editor/repoStore'
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
import { GrassLayer } from './scene/GrassLayer'
import { IslandTerrain } from './scene/IslandTerrain'
import { PlaceGhost } from './scene/PlaceGhost'
import { PlacedObjects } from './scene/PlacedObjects'
import { SeaSurface } from './scene/SeaSurface'
import { CHARACTER_CLIPS, type CharacterClip, DEFAULT_CLIP } from './models/characterAsset'
import { adjustTierToward, brushCells, isLandTier, setSurface, setTier } from './terrain/gridOps'
import {
  addObject,
  findCharacter,
  makePlacedObject,
  objectAt,
  removeObject,
  withSingleCharacter,
} from './terrain/objectOps'
import { seedIsland } from './terrain/seed'
import {
  cellIndex,
  cellLine,
  inBounds,
  type IslandSpec,
  MAX_TIER,
  type ObjectKind,
  type PlacedObject,
  SURFACE_AUTO,
  SURFACE_GRASS,
  worldToCell,
} from './terrain/terrainGrid'
import { AnimationDock } from './ui/AnimationDock'
import { CameraDock } from './ui/CameraDock'
import { FileBar } from './ui/FileBar'
import { ModelPanel } from './ui/ModelPanel'
import { type BrushSize, type Tool, ToolPanel } from './ui/ToolPanel'

const SAVED = loadSpec()
const INITIAL: IslandSpec = SAVED ?? seedIsland()

const autosave = createAutosaver()

/** Minimal shape of the three OrbitControls instance drei forwards. */
type OrbitControlsLike = { object: Camera; target: Vector3; update: () => void }

/** A cell is placeable when it is in bounds AND its tier is land (above the sea). */
function isLandCell(spec: IslandSpec, c: number, r: number): boolean {
  const g = spec.grid
  if (!inBounds(g, c, r)) return false
  return isLandTier(g.tiers[cellIndex(g, c, r)], spec.tierHeights, spec.seaLevel)
}

export function App() {
  const [tool, setTool] = useState<Tool>('raise')
  const [brushSize, setBrushSize] = useState<BrushSize>(1)
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  // Hold-Space: drags orbit the camera instead of painting.
  const [cameraMode, setCameraMode] = useState(false)
  // The hotbar Camera tool is the sticky version of hold-Space: while selected,
  // plain drags orbit (no pan) and terrain editing is off.
  const cameraToolActive = tool === 'camera'
  const orbiting = cameraMode || cameraToolActive

  // Object placement: an armed kind (null = not placing). While armed, the
  // terrain reports the hovered cell for the ghost and a click drops an object.
  const [placeKind, setPlaceKind] = useState<ObjectKind | null>(null)
  const placeMode = placeKind !== null
  const placeKindRef = useRef(placeKind)
  placeKindRef.current = placeKind
  // Hovered cell for the ghost preview (null = off-terrain / out of bounds).
  const [ghostCell, setGhostCell] = useState<{ c: number; r: number } | null>(null)

  // The placed character's animation clip — ephemeral UI state, not part of
  // the serialized spec (decided out of scope for this plan).
  const [clip, setClip] = useState<CharacterClip>(DEFAULT_CLIP)

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
  // Per-stroke raise/lower target tier, captured from the first painted cell
  // (null = not yet captured this stroke). Cells move one step toward this
  // target and are never pushed past it — see adjustTierToward.
  const strokeTarget = useRef<number | null>(null)

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
    strokeTarget.current = null
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
    if (strokeTarget.current === null) {
      // Tier under the cursor at stroke start; fall back to the first brush
      // cell if the exact cursor cell is out of bounds.
      const centerIdx = inBounds(grid, c, r) ? cellIndex(grid, c, r) : cells[0]
      const startTier = grid.tiers[centerIdx]
      const dir = toolRef.current === 'lower' ? -1 : 1
      strokeTarget.current = Math.max(0, Math.min(MAX_TIER, startTier + dir))
    }
    switch (toolRef.current) {
      case 'raise':
        adjustTierToward(grid, cells, +1, strokeTarget.current)
        break
      case 'lower':
        adjustTierToward(grid, cells, -1, strokeTarget.current)
        break
      case 'water':
        setTier(grid, cells, 0)
        break
      case 'grass':
        setSurface(grid, cells, SURFACE_GRASS)
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

  // ── Object placement ────────────────────────────────────────────────────────
  // Same spec-ref + tick discipline as terraform strokes: never mutate the spec
  // inside a React updater (StrictMode double-invoke would double-apply).
  const applyObjects = useCallback((objects: PlacedObject[]) => {
    specRef.current.objects = objects
    setGridTick((t) => t + 1)
  }, [])

  const placeObject = useCallback(
    (x: number, z: number) => {
      const kind = placeKindRef.current
      if (!kind) return
      const s = specRef.current
      const { c, r } = worldToCell(s.worldSize, s.grid, x, z)
      if (!isLandCell(s, c, r)) return
      const objs = s.objects
      if (kind === 'character') {
        // Needs an EMPTY land cell; replaces any existing character (max 1).
        if (objectAt(objs, c, r)) return
        const prev = findCharacter(objs)
        const o = makePlacedObject(kind, c, r, Math.random) // runtime jitter is fine here
        applyObjects(withSingleCharacter(objs, o))
        stack.push({
          label: 'Place character',
          do: () => applyObjects(withSingleCharacter(specRef.current.objects, o)),
          undo: () =>
            applyObjects(
              prev
                ? withSingleCharacter(removeObject(specRef.current.objects, o.id), prev)
                : removeObject(specRef.current.objects, o.id),
            ),
        })
        bumpStack()
        return
      }
      // Static kinds: never drop INTO the character's cell (visual collision);
      // stacking on each other stays allowed (pre-existing behavior).
      const blocker = objectAt(objs, c, r)
      if (blocker?.kind === 'character') return
      const o = makePlacedObject(kind, c, r, Math.random) // runtime jitter is fine here
      applyObjects(addObject(objs, o))
      stack.push({
        label: 'Place object',
        do: () => applyObjects(addObject(specRef.current.objects, o)),
        undo: () => applyObjects(removeObject(specRef.current.objects, o.id)),
      })
      bumpStack()
    },
    [applyObjects, stack, bumpStack],
  )

  const removeObj = useCallback(
    (id: string) => {
      const s = specRef.current
      const obj = s.objects.find((o) => o.id === id)
      if (!obj) return
      applyObjects(removeObject(s.objects, id))
      stack.push({
        label: 'Remove object',
        do: () => applyObjects(removeObject(specRef.current.objects, id)),
        undo: () => applyObjects(addObject(specRef.current.objects, obj)),
      })
      bumpStack()
    },
    [applyObjects, stack, bumpStack],
  )

  const onPlaceHover = useCallback((x: number, z: number) => {
    const s = specRef.current
    const { c, r } = worldToCell(s.worldSize, s.grid, x, z)
    if (!isLandCell(s, c, r)) {
      setGhostCell((prev) => (prev === null ? prev : null))
      return
    }
    setGhostCell((prev) => (prev && prev.c === c && prev.r === r ? prev : { c, r }))
  }, [])

  // Model-panel arming: pick a kind to arm; click the armed kind to disarm.
  const onPick = useCallback((k: ObjectKind) => {
    setPlaceKind((cur) => (cur === k ? null : k))
  }, [])

  // ── Animation cycler ─────────────────────────────────────────────────────────
  const hasCharacter = spec.objects.some((o) => o.kind === 'character')
  const cycleClip = useCallback((dir: 1 | -1) => {
    setClip((cur) => {
      const i = CHARACTER_CLIPS.indexOf(cur)
      const next = (i + dir + CHARACTER_CLIPS.length) % CHARACTER_CLIPS.length
      return CHARACTER_CLIPS[next]
    })
  }, [])
  const prevClip = useCallback(() => cycleClip(-1), [cycleClip])
  const nextClip = useCallback(() => cycleClip(1), [cycleClip])

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
      } else if (!mod && e.key === 'Escape') {
        // Esc disarms placement (the model panel is the arming surface now).
        setPlaceKind(null)
        setGhostCell(null)
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
      if (e.code !== 'Space') return
      if (inEditable(e.target)) return
      // Space's own defaults would fight the gesture: it scrolls the page and
      // re-fires whichever panel tile was clicked last (buttons activate on Space).
      e.preventDefault()
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

  // Save/Load persist to the repo-tracked saves/island.json via the dev-server
  // middleware (server/islandSavePlugin.ts). Silent on success; alert on failure.
  const saveToRepo = useCallback(async () => {
    try {
      await saveSpecToRepo(specRef.current)
    } catch (err) {
      alert(`Could not save island: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const loadFromRepo = useCallback(async () => {
    try {
      const spec = await loadSpecFromRepo()
      specRef.current = spec
      setGridTick((t) => t + 1)
      stack.clear() // never let undo resurrect pre-load state
      bumpStack()
    } catch (err) {
      alert(`Could not load island: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [stack, bumpStack])

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
      <Canvas
        camera={{ position: [14, 11, 14], fov: 50 }}
        shadows="soft"
        gl={{ toneMappingExposure: 1.1 }}
      >
        <Backdrop />
        <SeaSurface key={`${spec.grid.cols}x${spec.grid.rows}`} spec={spec} />
        <IslandTerrain
          spec={spec}
          brushSize={brushSize}
          cameraMode={orbiting}
          placeMode={placeMode}
          onPlaceHover={onPlaceHover}
          onPlaceClick={placeObject}
          onPaintStart={onPaintStart}
          onPaint={paint}
          onPaintEnd={onPaintEnd}
        />
        {/* GLB-backed models suspend while their assets stream in. */}
        <Suspense fallback={null}>
          <GrassLayer key={`${spec.grid.cols}x${spec.grid.rows}`} spec={spec} />
          <PlacedObjects spec={spec} placeMode={placeMode} onRemove={removeObj} clip={clip} />
          {placeKind !== null && <PlaceGhost spec={spec} kind={placeKind} cell={ghostCell} />}
        </Suspense>
        <OrbitControls
          ref={setControls}
          makeDefault
          enabled={orbitEnabled || orbiting}
          // Plain drag = PAN (ground-plane, so the island slides under the camera
          // without changing altitude); hold-Space or the hotbar Camera tool
          // ORBITS, so the left button remaps to ROTATE for the duration.
          //
          // Space can't ride along on the pointer event the way the old Cmd
          // gesture did: OrbitControls only flips a PAN drag into a rotate when
          // it sees ctrl/meta/shift on the mousedown (see its _STATE.PAN case).
          // A bare LEFT: PAN would therefore just pan while Space is held.
          //
          // The Camera TOOL is orbit-only by request: pan is disabled entirely
          // (hold-Space keeps right-drag pan, the tool does not).
          enableRotate={orbiting}
          enablePan={!cameraToolActive}
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: orbiting ? MOUSE.ROTATE : MOUSE.PAN,
            MIDDLE: MOUSE.DOLLY,
            RIGHT: MOUSE.PAN,
          }}
          maxPolarAngle={Math.PI / 2 - 0.05} // never orbit below the horizon
          minDistance={4}
          maxDistance={120}
        />
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
      <FileBar onSave={saveToRepo} onLoad={loadFromRepo} onExport={exportSpec} onImport={openImport} onReset={reset} />
      <ModelPanel placeKind={placeKind} onPick={onPick} />
      {hasCharacter && <AnimationDock clip={clip} onPrev={prevClip} onNext={nextClip} />}
    </div>
  )
}
