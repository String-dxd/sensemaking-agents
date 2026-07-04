import { useEffect, useMemo } from 'react'
import { FacePanel } from './panels/FacePanel'
import { usePlayStore } from './play/playStore'
import { studioCommands } from './state/commandStore'
import { Stage } from './viewport/Stage'

function checkWebGpuFlag() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('gpu') === 'webgpu') {
    console.warn('WebGPU path not yet implemented (plan 000 §4.4)')
  }
}

/** App-level undo/redo keyboard wiring (plan 009 step 1): ⌘Z / ⇧⌘Z (or
 * Ctrl on non-mac), skipped while a form control has focus. */
function useUndoRedoKeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) studioCommands.redo()
      else studioCommands.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

export function App() {
  const showStats = useMemo(() => new URLSearchParams(window.location.search).get('stats') === '1', [])
  const playing = usePlayStore((s) => s.mode) === 'play'

  checkWebGpuFlag()
  useUndoRedoKeys()

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Stage showStats={showStats} />
      {playing ? null : <FacePanel />}
    </div>
  )
}
