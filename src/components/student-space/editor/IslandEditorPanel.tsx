/**
 * IslandEditorPanel — dev-only island authoring surface (plan 003).
 *
 * Mounts only under `import.meta.env.DEV` + `location.hash` includes "editor".
 * Never shipped to production.
 *
 * Sections:
 *   1. Add palette: kind + species selectors + "Add" button
 *   2. Inspector: x/z/yaw/scale number inputs, species select, locked toggle, Delete
 *   3. Undo / Redo buttons
 *   4. Diverged badge + Revert to default
 *   5. Preview toggle (bare / populated)
 *
 * Engine access: game is cast to an internal shape to reach state.islandLayout,
 * view.editController, view.tree/flowers/fruits — same pattern as CameraTuneBridge
 * and MatureIslandBridge in EngineHost.tsx.
 */

import { useEffect, useState } from 'react'
import type { Game } from '~/engine/student-space/Game'
import { useEngineSliceVersion } from '~/lib/student-space/use-engine-slice-version'

// ── Known species per kind ────────────────────────────────────────────────────

const TREE_SPECIES = ['oak', 'cherry'] as const
const FLOWER_SPECIES = ['daisy', 'tulip', 'rose', 'lily', 'pansy', 'hyacinth'] as const
const FRUIT_SPECIES = ['plum', 'fig', 'citrus', 'berry', 'apple', 'pear'] as const

type Kind = 'tree' | 'flower' | 'fruit'
type Species = string

const SPECIES_BY_KIND: Record<Kind, readonly string[]> = {
  tree: TREE_SPECIES,
  flower: FLOWER_SPECIES,
  fruit: FRUIT_SPECIES,
}

// ── Internal engine shape (cast target) ──────────────────────────────────────

interface PlacedObject {
  id: string
  kind: string
  species?: string
  x: number
  z: number
  yaw?: number
  scale?: number
  locked?: boolean
}

interface IslandLayoutSlice {
  subscribe(cb: (event: unknown) => void): () => void
  list(): PlacedObject[]
  listByKind(kind: string): PlacedObject[]
  get(id: string): PlacedObject | undefined
  addObject(obj: Partial<PlacedObject>): void
  removeObject(id: string): void
  updateObject(id: string, patch: Partial<PlacedObject>): void
  isDiverged(): boolean
  revertToDefault(): void
  serialize(): { v: number; objects: PlacedObject[] }
  setLayout(snapshot: unknown): void
}

interface CommandStack {
  push(cmd: { do: () => void; undo: () => void }): void
  undo(): void
  redo(): void
  undoCount: number
  redoCount: number
}

interface EditController {
  activate(): void
  deactivate(): void
  applyTransform(
    id: string,
    patch: { x?: number; z?: number; yaw?: number; scale?: number },
  ): boolean
  selection: {
    get(): string | null
    onChange(cb: (id: string | null) => void): () => void
    select?(id: string, object3d: unknown): void
  }
  commandStack: CommandStack
}

interface SpeciesPaletteSlice {
  get(kind: string, species: string): Record<string, string> | null
  setColor(kind: string, species: string, colors: Record<string, string>): void
  list(): {
    v: number
    tree: Record<string, Record<string, string>>
    flower: Record<string, Record<string, string>>
    fruit: Record<string, Record<string, string>>
  }
  isDiverged(): boolean
  revertToDefault(): void
  serialize(): unknown
  setFromSnapshot(raw: unknown): void
  subscribe(cb: (event: unknown) => void): () => void
}

interface InternalGame {
  state?: {
    islandLayout?: IslandLayoutSlice
    speciesPalette?: SpeciesPaletteSlice
    island?: { isPlaceable(x: number, z: number): boolean }
  }
  view?: {
    editController?: EditController
    tree?: { showAll?: () => void; hideAll?: () => void }
    flowers?: { showAll?: () => void; hideAll?: () => void }
    fruits?: { showAll?: () => void; hideAll?: () => void }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface IslandEditorPanelProps {
  game: Game
}

export function IslandEditorPanel({ game }: IslandEditorPanelProps) {
  const [hashOk, setHashOk] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('editor'),
  )

  useEffect(() => {
    const check = () => setHashOk(window.location.hash.includes('editor'))
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  if (!hashOk) return null
  return <PanelInner game={game} />
}

function PanelInner({ game }: IslandEditorPanelProps) {
  const internal = game as unknown as InternalGame
  const layout = internal.state?.islandLayout
  const palette = internal.state?.speciesPalette
  const ctrl = internal.view?.editController

  // Subscribe to layout + palette mutations for re-render.
  useEngineSliceVersion(layout ?? null)
  useEngineSliceVersion(palette ?? null)

  // Track selected object id.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!ctrl) return
    ctrl.activate()
    return () => ctrl.deactivate()
  }, [ctrl])

  useEffect(() => {
    if (!ctrl) return
    return ctrl.selection.onChange((id) => setSelectedId(id))
  }, [ctrl])

  // ── Add palette state ────────────────────────────────────────────────────
  const [addKind, setAddKind] = useState<Kind>('flower')
  const [addSpecies, setAddSpecies] = useState<Species>(FLOWER_SPECIES[0])

  // Keep addSpecies valid when kind changes.
  useEffect(() => {
    const opts = SPECIES_BY_KIND[addKind]
    if (!opts.includes(addSpecies)) setAddSpecies(opts[0] ?? '')
  }, [addKind, addSpecies])

  // ── Preview state ────────────────────────────────────────────────────────
  const [preview, setPreview] = useState(false)
  const view = internal.view

  // ── Derived inspector data ───────────────────────────────────────────────
  const selected = selectedId ? layout?.get(selectedId) : null

  // ── Undo/redo counts (re-render on each layout change already fires) ─────
  const undoCount = ctrl?.commandStack.undoCount ?? 0
  const redoCount = ctrl?.commandStack.redoCount ?? 0

  // ── Export / Import ──────────────────────────────────────────────────────

  function handleExport() {
    if (!layout) return
    const json = JSON.stringify(layout.serialize(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `island-layout-${Date.now().toString(36)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    if (!layout) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string)
          layout.setLayout(parsed)
        } catch {
          alert('Invalid JSON file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function handlePaletteExport() {
    if (!palette) return
    const json = JSON.stringify(palette.serialize(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `species-palette-${Date.now().toString(36)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePaletteImport() {
    if (!palette) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string)
          palette.setFromSnapshot(parsed)
        } catch {
          alert('Invalid JSON file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!layout || !ctrl) return
    const id = `${addKind}-${Date.now().toString(36)}`
    const obj: Partial<PlacedObject> = {
      id,
      kind: addKind,
      species: addSpecies,
      x: 0,
      z: 0,
      yaw: 0,
      scale: 1,
    }
    const before = { id }
    layout.addObject(obj)
    ctrl.commandStack.push({
      do: () => layout.addObject({ ...obj }),
      undo: () => layout.removeObject(before.id),
    })
    // Auto-select.
    ctrl.selection.select?.(id, null as never)
  }

  function handleDelete() {
    if (!layout || !ctrl || !selectedId) return
    const snap = layout.get(selectedId)
    if (!snap) return
    layout.removeObject(selectedId)
    ctrl.commandStack.push({
      do: () => layout.removeObject(selectedId),
      undo: () => layout.addObject({ ...snap }),
    })
    setSelectedId(null)
  }

  function handleFieldChange(field: 'x' | 'z' | 'yaw' | 'scale', raw: string) {
    if (!ctrl || !selectedId) return
    const val = Number.parseFloat(raw)
    if (!Number.isFinite(val)) return
    ctrl.applyTransform(selectedId, { [field]: val })
  }

  function handleSpeciesChange(species: string) {
    if (!layout || !selectedId) return
    layout.updateObject(selectedId, { species })
  }

  function handleLockedChange(locked: boolean) {
    if (!layout || !selectedId) return
    layout.updateObject(selectedId, { locked })
  }

  function handleRevert() {
    if (!layout) return
    if (!window.confirm('Revert to committed default? All local edits will be lost.')) return
    layout.revertToDefault()
  }

  function handlePreviewToggle(on: boolean) {
    setPreview(on)
    if (on) {
      view?.tree?.showAll?.()
      view?.flowers?.showAll?.()
      view?.fruits?.showAll?.()
    } else {
      view?.tree?.hideAll?.()
      view?.flowers?.hideAll?.()
      view?.fruits?.hideAll?.()
    }
  }

  const diverged = layout?.isDiverged() ?? false

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: 9999,
        background: 'rgba(10,10,15,0.92)',
        color: '#e2e8f0',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '12px',
        fontFamily: 'monospace',
        width: '240px',
        pointerEvents: 'auto',
        userSelect: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        maxHeight: '90vh',
        overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.05em' }}>
          ⬡ ISLAND EDITOR
        </span>
        <span style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={handleExport}
            style={btnStyle(false)}
            title="Export layout JSON"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={handleImport}
            style={btnStyle(false)}
            title="Import layout JSON"
          >
            ↑
          </button>
        </span>
      </div>

      {/* ── Add palette ────────────────────────────────────────────── */}
      <section style={{ marginBottom: '10px' }}>
        <div style={{ color: '#64748b', marginBottom: '4px' }}>ADD</div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {(['tree', 'flower', 'fruit'] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAddKind(k)}
              style={btnStyle(addKind === k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {SPECIES_BY_KIND[addKind].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAddSpecies(s)}
              style={btnStyle(addSpecies === s)}
            >
              {s}
            </button>
          ))}
        </div>
        <button type="button" onClick={handleAdd} style={actionBtnStyle}>
          + Add
        </button>
      </section>

      <hr style={{ borderColor: 'rgba(255,255,255,0.1)', marginBottom: '10px' }} />

      {/* ── Inspector ──────────────────────────────────────────────── */}
      {selected ? (
        <section style={{ marginBottom: '10px' }}>
          <div style={{ color: '#64748b', marginBottom: '4px' }}>
            INSPECTOR —{' '}
            <span style={{ color: '#94a3b8' }}>
              {selected.kind}:{selected.id.slice(-6)}
            </span>
          </div>
          {(['x', 'z', 'yaw', 'scale'] as const).map((field) => (
            <label
              key={field}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}
            >
              <span style={{ width: '36px', color: '#64748b' }}>{field}</span>
              <input
                type="number"
                step={field === 'scale' ? 0.05 : 0.1}
                defaultValue={(selected[field] ?? (field === 'scale' ? 1 : 0)).toFixed(3)}
                key={`${selectedId}-${field}-${selected[field]}`}
                onBlur={(e) => handleFieldChange(field, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFieldChange(field, e.currentTarget.value)
                }}
                style={inputStyle}
              />
            </label>
          ))}

          {/* Species */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ width: '36px', color: '#64748b' }}>spc</span>
            <select
              value={selected.species ?? ''}
              onChange={(e) => handleSpeciesChange(e.currentTarget.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {(SPECIES_BY_KIND[selected.kind as Kind] ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Locked */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ width: '36px', color: '#64748b' }}>lock</span>
            <input
              type="checkbox"
              checked={selected.locked ?? false}
              onChange={(e) => handleLockedChange(e.currentTarget.checked)}
            />
          </label>

          <button
            type="button"
            onClick={handleDelete}
            style={{ ...actionBtnStyle, background: '#7f1d1d' }}
          >
            ✕ Delete
          </button>
        </section>
      ) : (
        <div style={{ color: '#475569', marginBottom: '10px', fontStyle: 'italic' }}>
          Click an object to select
        </div>
      )}

      <hr style={{ borderColor: 'rgba(255,255,255,0.1)', marginBottom: '10px' }} />

      {/* ── Undo / Redo ────────────────────────────────────────────── */}
      <section style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={() => ctrl?.commandStack.undo()}
          disabled={undoCount === 0}
          style={btnStyle(false, undoCount === 0)}
          title="Undo"
        >
          ↶ {undoCount}
        </button>
        <button
          type="button"
          onClick={() => ctrl?.commandStack.redo()}
          disabled={redoCount === 0}
          style={btnStyle(false, redoCount === 0)}
          title="Redo"
        >
          ↷ {redoCount}
        </button>
      </section>

      {/* ── Diverged badge + revert ─────────────────────────────────── */}
      {diverged && (
        <section style={{ marginBottom: '10px' }}>
          <div
            style={{
              background: 'rgba(202,138,4,0.18)',
              border: '1px solid rgba(202,138,4,0.4)',
              borderRadius: '4px',
              padding: '4px 6px',
              color: '#fbbf24',
              marginBottom: '6px',
              fontSize: '11px',
            }}
          >
            ⚠ Local edits — differs from committed default
          </div>
          <button
            type="button"
            onClick={handleRevert}
            style={{ ...actionBtnStyle, background: '#78350f' }}
          >
            ↺ Revert to default
          </button>
        </section>
      )}

      {/* ── Preview toggle ──────────────────────────────────────────── */}
      <section style={{ marginBottom: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={preview}
            onChange={(e) => handlePreviewToggle(e.currentTarget.checked)}
          />
          <span>Preview (populated)</span>
        </label>
      </section>

      <hr style={{ borderColor: 'rgba(255,255,255,0.1)', marginBottom: '10px' }} />

      {/* ── Species Palette ─────────────────────────────────────────── */}
      {palette && (
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: '#64748b' }}>PALETTE</span>
            <span style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePaletteExport}
                style={btnStyle(false)}
                title="Export palette JSON"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={handlePaletteImport}
                style={btnStyle(false)}
                title="Import palette JSON"
              >
                ↑
              </button>
            </span>
          </div>

          <PaletteEditor palette={palette} />

          {palette.isDiverged() && (
            <button
              type="button"
              onClick={() => palette.revertToDefault()}
              style={{ ...actionBtnStyle, background: '#78350f', marginTop: '6px' }}
            >
              ↺ Revert palette
            </button>
          )}
        </section>
      )}
    </div>
  )
}

// ── Palette color editor ─────────────────────────────────────────────────────

const PALETTE_KINDS: Array<{
  kind: string
  species: string[]
  slots: string[]
}> = [
  { kind: 'tree', species: ['oak', 'cherry'], slots: ['colorA', 'colorB'] },
  {
    kind: 'flower',
    species: ['daisy', 'tulip', 'rose', 'lily', 'pansy', 'hyacinth'],
    slots: ['petal', 'centre', 'face'],
  },
  {
    kind: 'fruit',
    species: ['apple', 'pear', 'plum', 'fig', 'citrus', 'berry'],
    slots: ['color'],
  },
]

function PaletteEditor({ palette }: { palette: SpeciesPaletteSlice }) {
  const paletteList = palette.list()

  return (
    <div>
      {PALETTE_KINDS.map(({ kind, species, slots }) => (
        <div key={kind} style={{ marginBottom: '8px' }}>
          <div style={{ color: '#475569', fontSize: '10px', marginBottom: '4px' }}>
            {kind.toUpperCase()}
          </div>
          {species.map((sp) => {
            const colors = (
              paletteList as unknown as Record<string, Record<string, Record<string, string>>>
            )[kind]?.[sp]
            if (!colors) return null
            return (
              <div
                key={sp}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}
              >
                <span style={{ width: '56px', color: '#64748b', fontSize: '10px' }}>{sp}</span>
                {slots.map((slot) => {
                  const val = colors[slot]
                  if (!val) return null
                  return (
                    <label
                      key={slot}
                      title={`${sp}.${slot}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="color"
                        value={val.toLowerCase()}
                        onChange={(e) => {
                          palette.setColor(kind, sp, {
                            [slot]: e.currentTarget.value.toUpperCase(),
                          })
                        }}
                        style={{
                          width: '22px',
                          height: '18px',
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                          background: 'none',
                        }}
                      />
                      <span style={{ fontSize: '9px', color: '#475569' }}>{slot}</span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function btnStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '2px 7px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)',
    color: disabled ? '#475569' : '#e2e8f0',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '11px',
    opacity: disabled ? 0.5 : 1,
  }
}

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: '4px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(99,102,241,0.3)',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: '12px',
  width: '100%',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '3px',
  color: '#e2e8f0',
  padding: '2px 5px',
  fontSize: '11px',
  fontFamily: 'monospace',
}
