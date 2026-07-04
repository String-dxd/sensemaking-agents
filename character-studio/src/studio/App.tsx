import { Shell } from './shell/Shell'

function checkWebGpuFlag() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('gpu') === 'webgpu') {
    console.warn('WebGPU path not yet implemented (plan 000 §4.4)')
  }
}

/**
 * App root (plan 012 recompose): the ad-hoc `<Stage> + <FacePanel>` mount
 * (with every OTHER panel mounted fixed-position inside Stage.tsx itself)
 * is now `<Shell>` — TopBar, managed ModeTabs column, roster, toasts, crash
 * boundary. See `src/studio/shell/Shell.tsx`.
 */
export function App() {
  checkWebGpuFlag()
  return <Shell />
}
