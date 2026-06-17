import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { type BirdConfig, defaultBirdConfig, setSlotColor, setSlotItem } from './bird/birdConfig'
import { FEATHER_PRESET_BY_ID } from './bird/palettes'
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
const INITIAL: BirdConfig =
  (typeof location !== 'undefined' ? decodeConfigFromHash(location.hash) : null) ??
  loadConfig() ??
  defaultBirdConfig()

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
  const [config, setConfig] = useState<BirdConfig>(INITIAL)
  const configRef = useRef(config)
  configRef.current = config
  const [selectedSlot, setSelectedSlot] = useState<string>(SLOTS[0].id)

  const stack = useRef(createCommandStack()).current
  const [, setStackVersion] = useState(0)
  const bumpStack = useCallback(() => setStackVersion((v) => v + 1), [])

  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Autosave + keep the URL hash in sync so the page is shareable + refresh-safe.
  useEffect(() => {
    autosave(config)
    if (typeof location !== 'undefined') {
      const h = encodeConfigToHash(config)
      if (location.hash !== h) history.replaceState(null, '', h)
    }
  }, [config])

  // Every discrete edit is one undoable command (before → after on one state obj).
  const commit = useCallback(
    (next: BirdConfig) => {
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
  const onSetItem = useCallback((slot: string, itemId: string) => commit(setSlotItem(configRef.current, slot, itemId)), [commit])
  const onSetSlotColor = useCallback(
    (slot: string, channel: 'base' | 'accent', hex: string) => commit(setSlotColor(configRef.current, slot, channel, hex)),
    [commit],
  )
  const onSetFeatherPreset = useCallback(
    (presetId: string) => {
      const preset = FEATHER_PRESET_BY_ID[presetId]
      if (!preset) return
      commit({ ...configRef.current, featherPalette: { ...preset.palette } })
    },
    [commit],
  )
  const onSetFeatherColor = useCallback(
    (channel: 'body' | 'accent', hex: string) =>
      commit({
        ...configRef.current,
        featherPalette: { ...configRef.current.featherPalette, [channel]: hex },
      }),
    [commit],
  )
  const onRandomize = useCallback(() => commit(randomizeConfig()), [commit])
  const onReset = useCallback(() => {
    clearSaved()
    setConfig(defaultBirdConfig())
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
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(location.href)
    }
  }, [])

  return (
    <ErrorBoundary>
      <div style={{ position: 'fixed', inset: 0 }}>
        <Suspense fallback={<Overlay>Loading bird…</Overlay>}>
          <Canvas
            shadows
            camera={{ position: [2.4, 1.4, 2.8], fov: 45 }}
            gl={{ toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              glRef.current = gl
            }}
          >
            <Backdrop />
            <Bird config={config} />
            <OrbitControls makeDefault autoRotate autoRotateSpeed={0.6} target={[0, 0.4, 0]} minDistance={1.5} maxDistance={8} />
          </Canvas>
        </Suspense>
      </div>

      <ToolPanel
        config={config}
        selectedSlot={selectedSlot}
        onSelectSlot={setSelectedSlot}
        onSetItem={onSetItem}
        onSetSlotColor={onSetSlotColor}
        onSetFeatherPreset={onSetFeatherPreset}
        onSetFeatherColor={onSetFeatherColor}
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

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />
    </ErrorBoundary>
  )
}
