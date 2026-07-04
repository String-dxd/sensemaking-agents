// Roster persistence (plan 012 step 2) — local-first IndexedDB. No
// dependency: a small typed wrapper on the native `indexedDB` API, plus the
// higher-level actions RosterView/TopBar/Shell call (New/Open/Duplicate/
// Rename/Delete/Import/Export, autosave, and crash-recovery revert).
//
// Interface is kept narrow on purpose (see maintenance note in plan 012):
// later server-synced rosters can replace everything below `openDb` without
// touching callers, as long as `useRosterStore` + these exported functions
// keep their shapes.

import { create } from 'zustand'
import {
  type Archetype,
  type CharacterSpec,
  CHARACTER_FILE_EXTENSION,
  createDefaultCharacter,
  type Personality,
  parseSpec,
  serializeSpec,
} from '../../core/spec'
import { pushToast } from '../shell/Toasts'
import { useCharacterStore } from '../state/characterStore'
import { captureThumbnail } from './thumbnails'

// ---- schema / upgrade policy -----------------------------------------------
//
// v1 (current):
//   - `characters` (keyPath 'id'): { id, name, updatedAt, specJson,
//     thumbnailBlob }. One row per saved character; `id` mirrors
//     `spec.meta.id` so `put` naturally upserts (re-importing the same
//     character updates it in place instead of duplicating it).
//   - `autosaveSlots` (autoIncrement keyPath 'slotId'), index
//     `byCharacterId` on `characterId`: crash-recovery snapshots, written
//     alongside every save and pruned to the AUTOSAVE_SLOT_LIMIT most recent
//     per character (plan 012 step 4 — "revert to last autosave").
//
// Future changes: add a new `if (event.oldVersion < N)` branch inside
// `onupgradeneeded`, bump DB_VERSION to N, and migrate/backfill existing
// rows there (e.g. `store.openCursor()` + `cursor.update(...)`). Never drop
// or recreate a store in a way that would lose `specJson` — this mirrors
// CharacterSpec's own migration rule (core/spec/schema.ts): retrofitting
// migrations after designers have saved rosters is how tools corrupt work.

const DB_NAME = 'character-studio-roster'
const DB_VERSION = 1
const CHARACTERS_STORE = 'characters'
const AUTOSAVE_STORE = 'autosaveSlots'
const AUTOSAVE_BY_CHARACTER_INDEX = 'byCharacterId'
export const AUTOSAVE_SLOT_LIMIT = 5
export const AUTOSAVE_DEBOUNCE_MS = 2000
export const AUTOSAVE_RETRY_MS = 500

export interface RosterRow {
  id: string
  name: string
  /** Epoch ms — the roster's own timestamp (distinct from `spec.meta.updatedAt`,
   * which is an ISO string and only bumped by spec-level edits). */
  updatedAt: number
  specJson: string
  thumbnailBlob: Blob | null
}

/** The grid view's projection — `specJson` can be large (sculpt deltas
 * quantize to a lot of numbers) and the grid never needs it. */
export type RosterListRow = Omit<RosterRow, 'specJson'>

interface AutosaveSlotRow {
  slotId?: number
  characterId: string
  specJson: string
  updatedAt: number
}

export class RosterImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RosterImportError'
  }
}

// ---- ~indexedDB wrapper (no dependency) ------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHARACTERS_STORE)) {
        db.createObjectStore(CHARACTERS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        db.createObjectStore(AUTOSAVE_STORE, { keyPath: 'slotId', autoIncrement: true }).createIndex(
          AUTOSAVE_BY_CHARACTER_INDEX,
          'characterId',
        )
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(value)
  await promisifyTransaction(tx)
}

async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readonly')
  return promisifyRequest(tx.objectStore(storeName).get(key) as IDBRequest<T>)
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readonly')
  return promisifyRequest(tx.objectStore(storeName).getAll() as IDBRequest<T[]>)
}

async function dbGetAllByIndex<T>(storeName: string, indexName: string, query: IDBValidKey): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readonly')
  return promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(query) as IDBRequest<T[]>)
}

async function dbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(key)
  await promisifyTransaction(tx)
}

// ---- pointer-down tracking (autosave gate) ---------------------------------

interface RosterStoreState {
  entries: RosterListRow[]
  loading: boolean
  /** True while any pointer button is held anywhere in the studio — a
   * 45-minute sculpt/drag session must not queue autosaves mid-stroke. */
  pointerDown: boolean
}

export const useRosterStore = create<RosterStoreState>(() => ({
  entries: [],
  loading: false,
  pointerDown: false,
}))

if (typeof window !== 'undefined') {
  const setDown = () => useRosterStore.setState({ pointerDown: true })
  const setUp = () => useRosterStore.setState({ pointerDown: false })
  // Capture phase: a descendant's `stopPropagation()` (e.g. LatticeTool's
  // control-point drag-start) only stops BUBBLING to other listeners — a
  // capture-phase listener on `window` already ran before the event reached
  // its target, so it can't be suppressed by that.
  window.addEventListener('pointerdown', setDown, { capture: true })
  window.addEventListener('pointerup', setUp, { capture: true })
  window.addEventListener('pointercancel', setUp, { capture: true })
}

// ---- roster list ------------------------------------------------------------

export async function refreshRosterEntries(): Promise<void> {
  useRosterStore.setState({ loading: true })
  try {
    const rows = await dbGetAll<RosterRow>(CHARACTERS_STORE)
    const entries: RosterListRow[] = rows
      .map(({ specJson: _specJson, ...rest }) => rest)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    useRosterStore.setState({ entries, loading: false })
  } catch (error) {
    useRosterStore.setState({ loading: false })
    throw error
  }
}

// ---- autosave slots (crash recovery, plan 012 step 4) ----------------------

async function pruneAutosaveSlots(characterId: string): Promise<void> {
  const rows = await dbGetAllByIndex<AutosaveSlotRow>(AUTOSAVE_STORE, AUTOSAVE_BY_CHARACTER_INDEX, characterId)
  const stale = rows.sort((a, b) => (b.slotId ?? 0) - (a.slotId ?? 0)).slice(AUTOSAVE_SLOT_LIMIT)
  if (stale.length === 0) return
  const db = await openDb()
  const tx = db.transaction(AUTOSAVE_STORE, 'readwrite')
  const store = tx.objectStore(AUTOSAVE_STORE)
  for (const row of stale) if (row.slotId !== undefined) store.delete(row.slotId)
  await promisifyTransaction(tx)
}

async function writeAutosaveSlot(characterId: string, specJson: string, updatedAt: number): Promise<void> {
  await dbPut<AutosaveSlotRow>(AUTOSAVE_STORE, { characterId, specJson, updatedAt })
  await pruneAutosaveSlots(characterId)
}

/** Number of crash-recovery slots currently kept for a character (never
 * more than `AUTOSAVE_SLOT_LIMIT`) — exposed for tests and any future "N
 * restore points available" affordance. */
export async function countAutosaveSlots(characterId: string): Promise<number> {
  const rows = await dbGetAllByIndex<AutosaveSlotRow>(AUTOSAVE_STORE, AUTOSAVE_BY_CHARACTER_INDEX, characterId)
  return rows.length
}

/**
 * Restore the most recent autosave slot that still parses (walking older
 * slots if the newest is somehow itself corrupt). Returns whether a restore
 * happened — the caller (the crash boundary) decides what to show on
 * failure.
 */
export async function revertToLastAutosave(characterId: string): Promise<boolean> {
  const rows = await dbGetAllByIndex<AutosaveSlotRow>(AUTOSAVE_STORE, AUTOSAVE_BY_CHARACTER_INDEX, characterId)
  const sorted = rows.sort((a, b) => (b.slotId ?? 0) - (a.slotId ?? 0))
  for (const row of sorted) {
    try {
      const spec = parseSpec(row.specJson)
      useCharacterStore.getState().setSpec(spec)
      return true
    } catch {
      // This slot is itself unreadable — fall back to the next older one.
    }
  }
  return false
}

// ---- save / autosave --------------------------------------------------------

function specToRow(spec: CharacterSpec, existing: RosterRow | undefined, thumbnailBlob: Blob | null): RosterRow {
  return {
    id: spec.meta.id,
    name: spec.meta.name,
    updatedAt: Date.now(),
    specJson: serializeSpec(spec),
    thumbnailBlob: thumbnailBlob ?? existing?.thumbnailBlob ?? null,
  }
}

async function persistSpec(spec: CharacterSpec, options?: { captureThumb?: boolean }): Promise<void> {
  const existing = await dbGet<RosterRow>(CHARACTERS_STORE, spec.meta.id)
  const thumbnailBlob =
    options?.captureThumb === false ? null : await captureThumbnail(spec.studioLook?.portraitCamera ?? null)
  const row = specToRow(spec, existing, thumbnailBlob)
  await dbPut(CHARACTERS_STORE, row)
  await writeAutosaveSlot(row.id, row.specJson, row.updatedAt)
  await refreshRosterEntries()
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
/** The in-flight autosave, if any — fire-and-forget for real usage (the UI
 * never blocks on it), but tracked so `flushPendingAutosave` can make the
 * debounce deterministically testable (and so a save from one test can't
 * bleed into the next). */
let pendingAutosave: Promise<void> | null = null

function scheduleAutosave(): void {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(runAutosaveTick, AUTOSAVE_DEBOUNCE_MS)
}

function runAutosaveTick(): void {
  autosaveTimer = null
  if (useRosterStore.getState().pointerDown) {
    // Don't drop the save — just wait for the pointer to lift, polling at a
    // shorter interval than the debounce itself.
    autosaveTimer = setTimeout(runAutosaveTick, AUTOSAVE_RETRY_MS)
    return
  }
  pendingAutosave = performAutosave().finally(() => {
    pendingAutosave = null
  })
}

async function performAutosave(): Promise<void> {
  const { spec, dirty, markClean } = useCharacterStore.getState()
  if (!dirty) return
  try {
    await persistSpec(spec)
    markClean()
  } catch (error) {
    console.error('[character-studio] autosave failed:', error)
    pushToast('Autosave failed — your latest edits may not be saved. See console for details.', 'error')
  }
}

/** Resolves once any in-flight debounce-triggered autosave has settled.
 * Real UI code doesn't need this (autosave is fire-and-forget); it exists
 * so tests can assert post-autosave state deterministically instead of
 * racing IndexedDB's own internal task scheduling. */
export async function flushPendingAutosave(): Promise<void> {
  await pendingAutosave
}

// Autosave fires on every dirty patch, debounced (skip-while-pointer-down
// above) — wired at module scope like every other cross-cutting studio
// store (`useLatticeStore`'s cancel-on-mode-change subscription is the same
// idiom). Works for the app's very first (never-yet-saved) scratch
// character too: there is no separate "activeId" to go stale — the roster
// key is always `spec.meta.id`, read fresh off the live store.
useCharacterStore.subscribe((state, prev) => {
  if (state.dirty && state.spec !== prev.spec) scheduleAutosave()
})

/** Force-save the currently open character right now (bypasses the debounce). */
export async function saveActiveCharacter(): Promise<void> {
  await persistSpec(useCharacterStore.getState().spec)
  useCharacterStore.getState().markClean()
}

// ---- explicit actions (New / Open / Duplicate / Rename / Delete) ----------

export async function newCharacter(archetype: Archetype, personality: Personality = 'gentle'): Promise<void> {
  const spec = createDefaultCharacter(archetype, personality)
  useCharacterStore.getState().setSpec(spec)
  await persistSpec(spec)
}

export async function openCharacter(id: string): Promise<void> {
  const row = await dbGet<RosterRow>(CHARACTERS_STORE, id)
  if (!row) throw new Error(`openCharacter: no roster row for id "${id}"`)
  useCharacterStore.getState().setSpec(parseSpec(row.specJson))
}

/** Returns the new character's id. Does not open it — the grid stays on
 * whatever the designer currently has open. */
export async function duplicateCharacter(id: string): Promise<string> {
  const row = await dbGet<RosterRow>(CHARACTERS_STORE, id)
  if (!row) throw new Error(`duplicateCharacter: no roster row for id "${id}"`)
  const original = parseSpec(row.specJson)
  const now = new Date().toISOString()
  const copy: CharacterSpec = {
    ...original,
    meta: { ...original.meta, id: crypto.randomUUID(), name: `${original.meta.name} copy`, createdAt: now, updatedAt: now },
  }
  await dbPut<RosterRow>(CHARACTERS_STORE, {
    id: copy.meta.id,
    name: copy.meta.name,
    updatedAt: Date.now(),
    specJson: serializeSpec(copy),
    thumbnailBlob: row.thumbnailBlob,
  })
  await refreshRosterEntries()
  return copy.meta.id
}

/** Renames by id, whether or not that character is the one currently open
 * (if it is, the live spec is patched too so the TopBar updates immediately). */
export async function renameCharacter(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('renameCharacter: name must not be empty')

  if (useCharacterStore.getState().spec.meta.id === id) {
    useCharacterStore.getState().patch((draft) => {
      draft.meta = { ...draft.meta, name: trimmed }
    })
    return
  }

  const row = await dbGet<RosterRow>(CHARACTERS_STORE, id)
  if (!row) throw new Error(`renameCharacter: no roster row for id "${id}"`)
  const spec = parseSpec(row.specJson)
  const renamed: CharacterSpec = { ...spec, meta: { ...spec.meta, name: trimmed, updatedAt: new Date().toISOString() } }
  await dbPut<RosterRow>(CHARACTERS_STORE, { ...row, name: trimmed, updatedAt: Date.now(), specJson: serializeSpec(renamed) })
  await refreshRosterEntries()
}

/** Deletes the row and its autosave slots. If the deleted character is the
 * one currently open, resets the live editor to a fresh default character
 * (otherwise the next autosave would silently resurrect the "deleted" row). */
export async function deleteCharacter(id: string): Promise<void> {
  await dbDelete(CHARACTERS_STORE, id)
  const slots = await dbGetAllByIndex<AutosaveSlotRow>(AUTOSAVE_STORE, AUTOSAVE_BY_CHARACTER_INDEX, id)
  for (const slot of slots) if (slot.slotId !== undefined) await dbDelete(AUTOSAVE_STORE, slot.slotId)
  if (useCharacterStore.getState().spec.meta.id === id) {
    useCharacterStore.getState().setSpec(createDefaultCharacter('biped-round'))
  }
  await refreshRosterEntries()
}

// ---- import / export --------------------------------------------------------

/** Parses + migrates (via `parseSpec`), opens the result as the live
 * character, and saves it. Throws `RosterImportError` (never a raw
 * `SyntaxError`/zod error) on anything from malformed JSON to a spec from a
 * future, unsupported `specVersion` — callers surface `.message` in a toast. */
export async function importCharacterFromText(text: string): Promise<CharacterSpec> {
  let spec: CharacterSpec
  try {
    spec = parseSpec(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RosterImportError(`That file isn't valid JSON (${error.message}).`, { cause: error })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new RosterImportError(`Could not import that character file: ${message}`, { cause: error })
  }
  useCharacterStore.getState().setSpec(spec)
  await persistSpec(spec)
  return spec
}

export async function importCharacterFile(file: File): Promise<CharacterSpec> {
  return importCharacterFromText(await file.text())
}

function downloadCharacterFile(name: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name || 'character'}${CHARACTER_FILE_EXTENSION}`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Downloads the LIVE in-memory spec (may be ahead of the last autosave). */
export function exportActiveCharacter(): void {
  const spec = useCharacterStore.getState().spec
  downloadCharacterFile(spec.meta.name, serializeSpec(spec))
}

/** Downloads the roster's saved copy by id (byte-identical to what's stored). */
export async function exportCharacterById(id: string): Promise<void> {
  const row = await dbGet<RosterRow>(CHARACTERS_STORE, id)
  if (!row) throw new Error(`exportCharacterById: no roster row for id "${id}"`)
  downloadCharacterFile(row.name, row.specJson)
}

/** The parsed+migrated saved spec for `id` — lets callers compile a
 * `.companion.glb` (plan 011) from any saved character without opening it.
 * Kept dependency-light (no compiler imports) so the store stays lean. */
export async function getCharacterSpecById(id: string): Promise<CharacterSpec> {
  const row = await dbGet<RosterRow>(CHARACTERS_STORE, id)
  if (!row) throw new Error(`getCharacterSpecById: no roster row for id "${id}"`)
  return parseSpec(row.specJson)
}

// Console access for tuning/debugging (mirrors __motionStudio/__playStore/
// __sculptStore/__latticeStore) — lets the roster be exercised from the
// browser console before RosterView's UI existed, and afterwards for
// manual QA (e.g. `await __roster.newCharacter('bird')`).
declare global {
  interface Window {
    __roster?: {
      useRosterStore: typeof useRosterStore
      newCharacter: typeof newCharacter
      openCharacter: typeof openCharacter
      duplicateCharacter: typeof duplicateCharacter
      renameCharacter: typeof renameCharacter
      deleteCharacter: typeof deleteCharacter
      importCharacterFromText: typeof importCharacterFromText
      exportActiveCharacter: typeof exportActiveCharacter
      exportCharacterById: typeof exportCharacterById
      revertToLastAutosave: typeof revertToLastAutosave
      saveActiveCharacter: typeof saveActiveCharacter
      refreshRosterEntries: typeof refreshRosterEntries
      countAutosaveSlots: typeof countAutosaveSlots
    }
  }
}
if (typeof window !== 'undefined') {
  window.__roster = {
    useRosterStore,
    newCharacter,
    openCharacter,
    duplicateCharacter,
    renameCharacter,
    deleteCharacter,
    importCharacterFromText,
    exportActiveCharacter,
    exportCharacterById,
    revertToLastAutosave,
    saveActiveCharacter,
    refreshRosterEntries,
    countAutosaveSlots,
  }
}
