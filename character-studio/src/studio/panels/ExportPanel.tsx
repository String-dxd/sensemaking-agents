// Export panel (plan 011 step 3) — a STANDALONE component: an export button
// that compiles the current character in-browser and downloads the
// `.companion.glb`, then shows the size/stats report.
//
// CONCURRENCY GUARD (plan 011): this component is intentionally NOT wired into
// App.tsx / Stage.tsx / the panel shell — plan 012 owns shell composition and
// gates its export action on this landing. It is a ready component; mount it
// yourself (temporarily) to verify. Everything it needs it loads itself, so it
// has no host wiring dependency.
//
// Textures ship as PNG (see textures.ts): in-browser KTX2/UASTC encoding is the
// plan's documented "if unreliable, fall back to PNG" branch — the panel notes
// that the CLI is the path for production KTX2 compression when that lands.

import { useCallback, useState } from 'react'
import type { CompileStats } from '../../core/export'
import { serializeSpec } from '../../core/spec/io'
import { compileAndDownloadCompanion } from '../roster/companionExport'
import { useCharacterStore } from '../state/characterStore'

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 260,
  padding: 16,
  borderRadius: 12,
  background: 'rgba(24, 24, 28, 0.9)',
  color: '#e8e8ec',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 20,
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#6ea8fe',
  color: '#0b1020',
  fontWeight: 600,
  cursor: 'pointer',
}

export function ExportPanel() {
  const specName = useCharacterStore((s) => s.spec.meta.name)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [stats, setStats] = useState<CompileStats | null>(null)
  const [message, setMessage] = useState<string>('')

  const onExport = useCallback(async () => {
    setStatus('working')
    setMessage('Loading assets…')
    setStats(null)
    try {
      const spec = useCharacterStore.getState().spec
      setMessage('Compiling GLB (meshopt)…')
      const s = await compileAndDownloadCompanion(spec)
      setStats(s)
      setStatus('done')
      setMessage(s.overBudget ? 'Exported — but over the 8 MB budget.' : 'Exported.')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const onSaveSpec = useCallback(() => {
    const spec = useCharacterStore.getState().spec
    const safeName = spec.meta.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'character'
    const bytes = new TextEncoder().encode(serializeSpec(spec))
    triggerDownload(bytes, `${safeName}.character.json`)
  }, [])

  const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(2)} MB`

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700 }}>Export</div>
      <div style={{ opacity: 0.7 }}>{specName}</div>
      <button type="button" style={buttonStyle} onClick={onExport} disabled={status === 'working'}>
        {status === 'working' ? 'Working…' : 'Export .companion.glb'}
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, background: '#3a3a44', color: '#e8e8ec' }}
        onClick={onSaveSpec}
      >
        Save .character.json
      </button>
      {message && (
        <div style={{ color: status === 'error' ? '#ff8a8a' : status === 'done' && stats?.overBudget ? '#ffd27a' : '#9fd39f' }}>
          {message}
        </div>
      )}
      {stats && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
          <dt style={{ opacity: 0.6 }}>Size</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{mb(stats.totalBytes)}</dd>
          <dt style={{ opacity: 0.6 }}>Tris</dt>
          <dd style={{ margin: 0 }}>{stats.triangles.toLocaleString()}</dd>
          <dt style={{ opacity: 0.6 }}>Clips</dt>
          <dd style={{ margin: 0 }}>{stats.clips.length}</dd>
          <dt style={{ opacity: 0.6 }}>Textures</dt>
          <dd style={{ margin: 0 }}>{mb(stats.textureBytes)} PNG</dd>
          <dt style={{ opacity: 0.6 }}>Skins</dt>
          <dd style={{ margin: 0 }}>{stats.skins}</dd>
        </dl>
      )}
      <div style={{ opacity: 0.5, fontSize: 11, lineHeight: 1.4 }}>
        Textures ship as PNG. Use the CLI (<code>pnpm export:character</code>) for production KTX2 compression when it lands.
      </div>
    </div>
  )
}
