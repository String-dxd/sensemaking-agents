import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Component, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  type BirdGenome,
  defaultGenome,
  type FaceSpec,
  type MorphDelta,
  type PatternSpec,
  type Personality,
  type PlumagePalette,
  type ProceduralBase,
  setFace,
  setGlbSpecies,
  setMorph,
  setName,
  setPart,
  setPattern,
  setPersonality,
  setSlotColor,
  setSlotItem,
  setSpecies,
  setZoneColor,
  type SpeciesId,
} from './bird/genome'
import type { BuildMode } from './bird/buildPlan'
import { randomizeConfig } from './bird/randomize'
import { SLOTS } from './bird/slots'
import { createCommandStack } from './editor/commandStack'
import { downloadConfig, importConfigFromFile } from './editor/exportConfig'
import { clearSaved, createAutosaver, loadConfig } from './editor/persistence'
import { decodeConfigFromHash, encodeConfigToHash } from './editor/urlHash'
import { Backdrop } from './scene/Backdrop'
import { Bird } from './scene/Bird'
import { ToolPanel } from './ui/ToolPanel'

// Initial config: a shared URL (hash) wins, then localStorage, then defaults.
const INITIAL: BirdGenome =
  (typeof location !== 'undefined' ? decodeConfigFromHash(location.hash) : null) ?? loadConfig() ?? defaultGenome()

// Build mode is a VIEW setting (not part of the genome): the same six genome
// slots render either as generic archetypes or as recognizable species. Seeded
// from the pre-existing ?set=species entry point so old links still open there.
const INITIAL_MODE: BuildMode =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('set') === 'species' ? 'species' : 'archetype'

const autosave = createAutosaver()

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        color: '#3a3a40',
        font: '14px ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) return <Overlay>Could not load the bird: {this.state.error.message}</Overlay>
    return this.props.children
  }
}

export function App() {
  const [config, setConfig] = useState<BirdGenome>(INITIAL)
  const configRef = useRef(config)
  configRef.current = config
  const [selectedSlot, setSelectedSlot] = useState<string>(SLOTS[0].id)
  const [buildMode, setBuildMode] = useState<BuildMode>(INITIAL_MODE)

  // QA affordances (headless screenshots): ?noRotate freezes the turntable,
  // ?cam=front|side|34 fixes the angle. Read once at mount.
  const qp = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
  const noRotate = qp.has('noRotate')
  const CAM: Record<string, [number, number, number]> = {
    front: [3.4, 0.9, 0.01],
    side: [0.01, 0.9, 3.4],
    '34': [2.4, 1.4, 2.8],
    back: [-2.6, 1.2, 2.6],
    side2: [0.6, 0.9, 3.3],
  }
  const camPos: [number, number, number] = CAM[qp.get('cam') ?? ''] ?? [2.4, 1.4, 2.8]
  const spin = (Number.parseFloat(qp.get('spin') ?? '0') || 0) * (Math.PI / 180) // rotate the model (reliable headless capture)

  const stack = useRef(createCommandStack()).current
  const [, setStackVersion] = useState(0)
  const bumpStack = useCallback(() => setStackVersion((v) => v + 1), [])

  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Autosave + keep the URL hash in sync so the page is shareable + refresh-safe.
  // encodeConfigToHash returns '' if over the cap (encode-side guard) — skip then.
  useEffect(() => {
    autosave(config)
    if (typeof location !== 'undefined') {
      const h = encodeConfigToHash(config)
      if (h && location.hash !== h) history.replaceState(null, '', h)
    }
  }, [config])

  // Keep ?set= in sync with the build mode so it is shareable, survives a
  // refresh, and is captured by "Copy link". Preserves the genome hash.
  useEffect(() => {
    if (typeof location === 'undefined') return
    const url = new URL(location.href)
    if (buildMode === 'species') url.searchParams.set('set', 'species')
    else url.searchParams.delete('set')
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [buildMode])

  // Every discrete edit is one undoable command (before → after on one state obj).
  const commit = useCallback(
    (next: BirdGenome) => {
      const prev = configRef.current
      if (next === prev) return
      setConfig(next)
      stack.push({ do: () => setConfig(next), undo: () => setConfig(prev) })
      bumpStack()
    },
    [stack, bumpStack],
  )

  const undo = useCallback(() => {
    if (stack.undo()) bumpStack()
  }, [stack, bumpStack])
  const redo = useCallback(() => {
    if (stack.redo()) bumpStack()
  }, [stack, bumpStack])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── Panel handlers ────────────────────────────────────────────────────────
  const onSetSpecies = useCallback((id: SpeciesId) => commit(setSpecies(configRef.current, id)), [commit])
  const onUseGlbLane = useCallback(() => commit(setGlbSpecies(configRef.current)), [commit])
  const onSetPart = useCallback(
    (part: keyof ProceduralBase['parts'], value: string) => commit(setPart(configRef.current, part, value)),
    [commit],
  )
  const onSetZoneColor = useCallback(
    (zone: keyof PlumagePalette, hex: string) => commit(setZoneColor(configRef.current, zone, hex)),
    [commit],
  )
  const onSetFace = useCallback((patch: Partial<FaceSpec>) => commit(setFace(configRef.current, patch)), [commit])
  const onSetMorph = useCallback((patch: MorphDelta) => commit(setMorph(configRef.current, patch)), [commit])
  const onSetPattern = useCallback((pattern: PatternSpec | null) => commit(setPattern(configRef.current, pattern)), [commit])
  const onSetName = useCallback((name: string) => commit(setName(configRef.current, name)), [commit])
  const onSetPersonality = useCallback((p: Personality) => commit(setPersonality(configRef.current, p)), [commit])
  const onSetItem = useCallback((slot: string, itemId: string) => commit(setSlotItem(configRef.current, slot, itemId)), [commit])
  const onSetSlotColor = useCallback(
    (slot: string, channel: 'base' | 'accent', hex: string) => commit(setSlotColor(configRef.current, slot, channel, hex)),
    [commit],
  )
  const onRandomize = useCallback(() => commit(randomizeConfig()), [commit])
  const onReset = useCallback(() => {
    clearSaved()
    setConfig(defaultGenome())
    stack.clear()
    bumpStack()
  }, [stack, bumpStack])

  const onExport = useCallback(() => downloadConfig(configRef.current), [])
  const onImport = useCallback(() => importInputRef.current?.click(), [])
  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        commit(await importConfigFromFile(file))
      } catch (err) {
        alert(`Could not import bird: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [commit],
  )

  const onScreenshot = useCallback(() => {
    const gl = glRef.current
    if (!gl) return
    const url = gl.domElement.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'bird.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])
  const onCopyLink = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(location.href)
  }, [])

  return (
    <ErrorBoundary>
      <div style={{ position: 'fixed', inset: 0 }}>
        <Suspense fallback={<Overlay>Loading bird…</Overlay>}>
          <Canvas
            shadows
            camera={{ position: camPos, fov: 45 }}
            gl={{ toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              glRef.current = gl
            }}
          >
            <Backdrop />
            <group rotation={[0, spin, 0]}>
              <Bird config={config} mode={buildMode} />
            </group>
            <OrbitControls makeDefault autoRotate={!noRotate} autoRotateSpeed={0.6} target={[0, 0.4, 0]} minDistance={1.5} maxDistance={8} />
          </Canvas>
        </Suspense>
      </div>

      <ToolPanel
        config={config}
        selectedSlot={selectedSlot}
        onSelectSlot={setSelectedSlot}
        onSetSpecies={onSetSpecies}
        onUseGlbLane={onUseGlbLane}
        buildMode={buildMode}
        onSetBuildMode={setBuildMode}
        onSetPart={onSetPart}
        onSetZoneColor={onSetZoneColor}
        onSetFace={onSetFace}
        onSetMorph={onSetMorph}
        onSetPattern={onSetPattern}
        onSetName={onSetName}
        onSetPersonality={onSetPersonality}
        onSetItem={onSetItem}
        onSetSlotColor={onSetSlotColor}
        canUndo={stack.canUndo()}
        canRedo={stack.canRedo()}
        onUndo={undo}
        onRedo={redo}
        onRandomize={onRandomize}
        onReset={onReset}
        onExport={onExport}
        onImport={onImport}
        onScreenshot={onScreenshot}
        onCopyLink={onCopyLink}
      />

      <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImportFile} />
    </ErrorBoundary>
  )
}
