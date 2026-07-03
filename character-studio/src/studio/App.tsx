import { useMemo } from 'react'
import { FacePanel } from './panels/FacePanel'
import { usePlayStore } from './play/playStore'
import { Stage } from './viewport/Stage'

function checkWebGpuFlag() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('gpu') === 'webgpu') {
    console.warn('WebGPU path not yet implemented (plan 000 §4.4)')
  }
}

export function App() {
  const showStats = useMemo(() => new URLSearchParams(window.location.search).get('stats') === '1', [])
  const playing = usePlayStore((s) => s.mode) === 'play'

  checkWebGpuFlag()

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Stage showStats={showStats} />
      {playing ? null : <FacePanel />}
    </div>
  )
}
