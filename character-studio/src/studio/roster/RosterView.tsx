// RosterView (plan 012 step 3) — entry screen (and TopBar's "Roster"
// button): thumbnail grid of saved characters (open/duplicate/delete/
// rename), "New Character" archetype cards, import/export. Each card also
// exports a runtime `.companion.glb` (plan 011): the saved spec is parsed and
// compiled in-browser via the shared compileAndDownloadCompanion path (the
// same one ExportPanel uses for the live character).
//
// Full-screen overlay rather than a routed page: this workspace has no
// router (plan 000 §7 — plain Vite SPA). Rename/Delete use the browser's
// native prompt()/confirm() rather than a bespoke modal, matching the
// "no UI framework" constraint and the studio's plain-CSS-and-native-inputs
// idiom elsewhere (color pickers, file inputs).

import { type ChangeEvent, type MouseEvent, useEffect, useState } from 'react'
import type { Archetype } from '../../core/spec/schema'
import { pushToast } from '../shell/Toasts'
import { useCharacterStore } from '../state/characterStore'
import { compileAndDownloadCompanion } from './companionExport'
import {
  deleteCharacter,
  duplicateCharacter,
  exportActiveCharacter,
  exportCharacterById,
  getCharacterSpecById,
  importCharacterFile,
  newCharacter,
  openCharacter,
  refreshRosterEntries,
  renameCharacter,
  RosterImportError,
  type RosterListRow,
  useRosterStore,
} from './rosterStore'

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`

const ARCHETYPE_CARDS: ReadonlyArray<{ id: Archetype; label: string; blurb: string }> = [
  { id: 'biped-round', label: 'Biped — round', blurb: 'Stout, round-bodied upright animal.' },
  { id: 'biped-slim', label: 'Biped — slim', blurb: 'Slender, upright animal.' },
  { id: 'bird', label: 'Bird', blurb: 'Feathered, beaked archetype.' },
]

function reportError(error: unknown, fallback: string): void {
  pushToast(error instanceof Error ? error.message : fallback, 'error')
}

/** Object URL for a roster thumbnail Blob, revoked on change/unmount. */
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function RosterCard({ id, name, updatedAt, thumbnailBlob, onOpen }: RosterListRow & { onOpen(): void }) {
  const thumbUrl = useObjectUrl(thumbnailBlob)
  const isOpen = useCharacterStore((s) => s.spec.meta.id === id)
  const [exportingGlb, setExportingGlb] = useState(false)

  const stop = (e: MouseEvent) => e.stopPropagation()

  const handleRename = async (e: MouseEvent) => {
    stop(e)
    const next = window.prompt('Rename character', name)
    if (!next || !next.trim() || next.trim() === name) return
    try {
      await renameCharacter(id, next)
      await refreshRosterEntries()
    } catch (error) {
      reportError(error, 'Could not rename that character.')
    }
  }

  const handleDuplicate = async (e: MouseEvent) => {
    stop(e)
    try {
      await duplicateCharacter(id)
    } catch (error) {
      reportError(error, 'Could not duplicate that character.')
    }
  }

  const handleDelete = async (e: MouseEvent) => {
    stop(e)
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    try {
      await deleteCharacter(id)
    } catch (error) {
      reportError(error, 'Could not delete that character.')
    }
  }

  const handleExport = async (e: MouseEvent) => {
    stop(e)
    try {
      await exportCharacterById(id)
    } catch (error) {
      reportError(error, 'Could not export that character.')
    }
  }

  const handleExportGlb = async (e: MouseEvent) => {
    stop(e)
    if (exportingGlb) return
    setExportingGlb(true)
    pushToast(`Compiling ${name} → .companion.glb…`, 'info')
    try {
      const spec = await getCharacterSpecById(id)
      const stats = await compileAndDownloadCompanion(spec)
      pushToast(
        `Exported ${name}.companion.glb (${mb(stats.totalBytes)})${stats.overBudget ? ' — over 8 MB budget' : ''}`,
        stats.overBudget ? 'error' : 'info',
      )
    } catch (error) {
      reportError(error, 'Could not export that character to .companion.glb.')
    } finally {
      setExportingGlb(false)
    }
  }

  return (
    <div className={isOpen ? 'cs-roster-card is-open' : 'cs-roster-card'}>
      <button type="button" className="cs-roster-card__open" onClick={onOpen} title="Open">
        {thumbUrl ? (
          <img className="cs-roster-card__thumb" src={thumbUrl} alt="" />
        ) : (
          <div className="cs-roster-card__thumb cs-roster-card__thumb--empty" aria-hidden />
        )}
        <span className="cs-roster-card__name">
          {name}
          {isOpen ? ' · open' : ''}
        </span>
      </button>
      <span className="cs-roster-card__meta">{new Date(updatedAt).toLocaleString()}</span>
      <div className="cs-roster-card__actions">
        <button type="button" className="cs-btn cs-btn--tab" onClick={handleDuplicate}>
          Duplicate
        </button>
        <button type="button" className="cs-btn cs-btn--tab" onClick={handleRename}>
          Rename
        </button>
        <button type="button" className="cs-btn cs-btn--tab" onClick={handleExport}>
          Export
        </button>
        <button
          type="button"
          className="cs-btn cs-btn--tab"
          onClick={handleExportGlb}
          disabled={exportingGlb}
          title="Compile a runtime .companion.glb"
        >
          {exportingGlb ? 'Compiling…' : 'Export .glb'}
        </button>
        <button type="button" className="cs-btn cs-btn--tab" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

export function RosterView({ onClose }: { onClose(): void }) {
  const entries = useRosterStore((s) => s.entries)
  const loading = useRosterStore((s) => s.loading)

  useEffect(() => {
    void refreshRosterEntries()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleOpen = async (id: string) => {
    try {
      await openCharacter(id)
      onClose()
    } catch (error) {
      reportError(error, 'Could not open that character.')
    }
  }

  const handleNew = async (archetype: Archetype) => {
    try {
      await newCharacter(archetype)
      onClose()
    } catch (error) {
      reportError(error, 'Could not create a new character.')
    }
  }

  const handleImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // clear so re-importing the same filename fires onChange again
    if (!file) return
    try {
      await importCharacterFile(file)
      onClose()
    } catch (error) {
      const message = error instanceof RosterImportError ? error.message : 'Could not import that file.'
      pushToast(message, 'error')
    }
  }

  return (
    <div className="cs-roster-overlay" role="dialog" aria-modal="true" aria-label="Roster">
      <div className="cs-roster">
        <header className="cs-roster__header">
          <h2>Roster</h2>
          <div className="cs-row">
            <button type="button" className="cs-btn" onClick={exportActiveCharacter}>
              Export current
            </button>
            <label className="cs-btn cs-roster__import-label">
              Import…
              <input
                type="file"
                accept=".character.json,application/json"
                className="cs-roster__import-input"
                onChange={handleImportChange}
              />
            </label>
            <button type="button" className="cs-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <section className="cs-col">
          <h3 className="cs-panel-section__title">New character</h3>
          <div className="cs-roster-archetypes">
            {ARCHETYPE_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className="cs-roster-archetype-card"
                onClick={() => handleNew(card.id)}
              >
                <strong>{card.label}</strong>
                <span>{card.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="cs-col">
          <h3 className="cs-panel-section__title">
            Saved characters {loading ? '(loading…)' : `(${entries.length})`}
          </h3>
          {entries.length === 0 && !loading ? (
            <p className="cs-roster__empty">
              No saved characters yet — pick an archetype above, or import a <code>.character.json</code> file.
            </p>
          ) : (
            <div className="cs-roster__grid">
              {entries.map((entry) => (
                <RosterCard key={entry.id} {...entry} onOpen={() => handleOpen(entry.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
