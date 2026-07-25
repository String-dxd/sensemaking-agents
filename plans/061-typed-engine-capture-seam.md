# Plan 061: Give the capture-facing engine slices typed sidecars and one canonical capture type; delete the four drifted copies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- src/engine/student-space/Game/State/ src/engine/student-space/Game/index.d.ts src/components/student-space/sheets/ src/lib/entry-date.ts src/components/ui/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (types and moves only, but real types surface latent errors)
- **Depends on**: plan 047 is a soft dependency — it touches capture fields; if
  047 is in flight, land it first to avoid a merge fight in the same files
- **Category**: tech-debt
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`src/engine/student-space/Game/State/` ships **13** hand-maintained `.d.ts`
sidecars for its vanilla-JS slices — but not for the four slices the routed
sheets actually read: `Captures.js`, `MoodPins.js`, `CalendarEvents.js`,
`Profile.js`. So the capture-entry shape is re-declared **inline four times**,
with drifted optionality, in the History surface. Every engine-slice field
change requires editing four unsynchronized copies with no compiler help — and
this is exactly the cluster where the July 2026 history-sheet regressions lived
(plans 033, 036, and the `entryDate` bucketing fix at HEAD, `031d1974`).

The absence also forces the sheets to punch through the engine's public type
with `as unknown as` — 9 casts across `src/components/student-space/sheets/*.tsx`
— and drags two duplicated date helpers and two divergent `StatTile`
components along with it. This is the flagship DRY plan of the audit suite:
one authoritative capture type, four real sidecars, and the duplicated helpers
collapsed into modules that already exist and are already tested.

**Zero runtime behavior change.** Types, one type re-export module, and three
moves. If you find yourself changing what the code *does*, you have left scope.

## Current state

### The 13 existing sidecars — and the 4 missing ones

`ls src/engine/student-space/Game/State/*.d.ts` →
`Choices.d.ts`, `IdentityStatusOverride.d.ts`, `Island.d.ts`,
`IslandLayout.d.ts`, `IslandSnapshotBridge.d.ts`, `Persistence.d.ts`,
`Relationships.d.ts`, `ShareTokenBridge.d.ts`, `SpeciesPalette.d.ts`,
`Sprouts.d.ts` (10 in `State/`; the other 3 live in `Game/Data/` and
`Game/util/`).

**Missing**: `Captures.d.ts`, `MoodPins.d.ts`, `CalendarEvents.d.ts`,
`Profile.d.ts`. All four are consumed by React surfaces — verified:

```
src/components/student-space/sheets/HistorySheet.tsx:92-94   moodPins, captures, calendar
src/components/student-space/sheets/MirrorDetailSheet.tsx:78-80  captures
src/components/student-space/sheets/ProfileSheet.tsx:235,330-331 profile, captures, moodPins
src/components/student-space/sheets/TrajectorySheet.tsx:129-136  profile, captures
src/components/student-space/capture/AskSheet.tsx:222,968       captures, profile
src/components/student-space/capture/CaptureFab.tsx:40,78-79    moodPins, captures
src/components/student-space/capture/MoodSheet.tsx:92,100       moodPins
```

**The sidecar convention to match** — `src/engine/student-space/Game/State/Sprouts.d.ts:1-4`
(read the whole file; it is the exemplar):

```ts
// Companion declarations for Sprouts.js — the engine's third state slice.
// Mirrors the public surface declared in `../index.d.ts` so internal callers
// (State.js wiring, the React overlay, vitest unit tests) can import the
// class + helpers directly via a typed path.

export type SproutSpecies = 'pending' | 'tree' | 'flower' | 'butterfly' | 'fruit'
export type SproutDimension = 'values' | 'interests' | 'personality' | 'skills'
...
export default class Sprouts {
  static instance: Sprouts | null
  static getInstance(): Sprouts | null
  sprouts: Sprout[]
  ...
}
```

### Why the engine's public type does not help

`src/engine/student-space/Game/index.d.ts:90-127` declares the state surface
with `subscribe`-only stubs, and says so explicitly:

```ts
  /**
   * Public state surface. The four slices below are the stable engine
   * contract; other engine-internal stores (TeacherLetters, CalendarEvents,
   * Island, Weather, etc.) are reachable at runtime via `(game.state as any)`
   * but are not declared here and are not part of the host contract.
   */
  state: {
    onboarding: { subscribe(listener: (event: unknown, context: unknown) => void): () => void }
    moodPins:   { subscribe(listener: (event: unknown, context: unknown) => void): () => void }
    profile:    { subscribe(listener: (event: unknown, context: unknown) => void): () => void }
    captures:   { subscribe(listener: (event: unknown, context: unknown) => void): () => void }
    auth: { ... }
    sprouts: { ... }
  }
```

That comment — "reachable at runtime via `(game.state as any)`" — **is** the
cast-generator. `useEngine()` returns this `Game` type
(`src/lib/student-space/use-engine.ts:13,20`), so any sheet that needs
`captures.entries` must cast around the declaration.

### The four drifted capture-entry copies

**Copy 1** — `src/components/student-space/sheets/MirrorDetailSheet.tsx:18-35`
(`entryDate` **optional**):

```ts
interface MirrorCapture {
  id: string
  entryDate?: string
  kind: string
  text?: string
  title?: string
  validation?: string
  createdAt?: string
  backendMirrorEntryId?: number | string
  reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string
  contextType?: string
  reframe?: {
    headline?: string
    highlightPhrase?: string
    themes?: string[]
    needs?: string[]
    moods?: string[]
  }
}
```

**Copy 2** — `interface DayDetailCapture` at
`src/components/student-space/sheets/DayDetailCard.tsx:28-49`. Same fields as
copy 1, but `entryDate: string` is **required**, and it adds
`prompt?: string | null`, `syncStatus?: 'local' | 'syncing' | 'synced' | 'failed' | string`,
`syncError?: string`, `caption?: string`.

**Copy 3** — inside a local `type EngineState` at
`src/components/student-space/sheets/HistorySheet.tsx:62-88`. A narrower third
copy, where `reviewStatus` is bare `string`:

```ts
  type Subscribable = { subscribe: (cb: () => void) => () => void }
  type EngineState = {
    moodPins?: Subscribable & { pins?: Array<{ entryDate: string; emotion?: string }> }
    captures?: Subscribable & {
      entries?: Array<{
        id: string; entryDate: string; kind: string; text?: string; createdAt?: string
        backendMirrorEntryId?: number | string; reviewStatus?: string
      }>
      findById?: (id: string) => unknown
      patch?: (id: string, updates: Record<string, unknown>) => unknown
    }
    calendar?: Subscribable & {
      events?: Array<{ entryDate?: string; date?: string; kind?: string; title?: string; label?: string }>
    }
    sprouts?: { years?: () => number[] }
    backend?: unknown
    applyBackendSnapshot?: (snapshot: unknown) => void
  }
```

**Copy 4** — a fourth, inline in the `resolveTargetDate` parameter at
`src/components/student-space/sheets/HistorySheet.tsx:434-447`:
`captures: Array<{ id?: string; entryDate: string; createdAt?: string; backendMirrorEntryId?: number | string; reviewStatus?: string }>`.

Note `reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string` in copies
1 and 2 — a union with `string` collapses to `string`, so the literal arm buys
**nothing**; and copies 3 and 4 type it bare `string`. Three different
answers to the same question.

### The authoritative field list lives in the engine

`src/engine/student-space/Game/State/schema.js:216-245` — `KNOWN_CAPTURE_KEYS`
is the allow-list every capture passes through on hydrate, plus the enum sets:

```js
// (inline comments elided — read the file; they document each field's purpose)
const KNOWN_CAPTURE_KEYS = new Set([
    'id', 'createdAt', 'entryDate', 'kind', 'text', 'prompt',
    'title', 'validation', 'dataUrl', 'caption',
    'backendMirrorEntryId', 'backendCartographerOutputId',
    'reviewStatus', 'syncStatus', 'syncError', 'contextType',
    'reframe', 'thread', 'trajectory', 'dimension', 'subClaimId', 'letterId',
])
const CAPTURE_DIMENSIONS = new Set(['values', 'interests', 'personality', 'skills'])
const REVIEW_STATES = new Set(['pending', 'confirmed', 'forgotten'])
const SYNC_STATES   = new Set(['local', 'syncing', 'synced', 'failed'])
```

Other authoritative sets in the same file:
`schema.js:24` — `CAPTURE_KIND = new Set(['ask', 'photo', 'trajectory'])`
`schema.js:300` — `REFRAME_KEYS = new Set(['headline', 'highlightPhrase', 'themes', 'needs', 'moods', 'edited'])`
`schema.js:323-336` — `mergeThread` produces `Array<{ role: 'kira' | 'you'; text: string }>`
`schema.js:188` — `KNOWN_PIN_KEYS = new Set(['id', 'createdAt', 'entryDate', 'emotion', 'intensity', 'cause', 'note', 'backendMirrorEntryId'])`
`schema.js:21-23` — `MOOD_EMOTION` (9 values), `MOOD_INTENSITY = {1,2,3,4}`, `MOOD_CAUSE` (10 values)
`schema.js:418` — `KNOWN_EVENT_KEYS = new Set(['id', 'label', 'kind', 'date'])`
`schema.js:26` — `EVENT_KINDS = new Set(['class', 'cca', 'note'])`

**Repo guardrail to honor and repeat in the sidecar comment** (from
`CLAUDE.md`'s memory of this seam): any new capture/snapshot field must be
added to `KNOWN_CAPTURE_KEYS` or it is **silently dropped** at the
React↔engine seam. The sidecar you write is the type-level mirror of that
allow-list; keeping them in sync is the whole point.

### The runtime slice surfaces the sidecars must declare

`Captures.js` (207 lines): `static instance`, `static getInstance()`,
`entries`, `subscribers`, `add(payload)`, `patch(id, updates)`,
`subscribe(cb)`, `recent(n = 7)`, `getPhoto(id)`, `findById(id)`,
`hydrate(snapshot)`, `upsertBackend(snapshot)`, `serialize()`.
**Note**: `patch` is defined **twice** — at `Captures.js:117` and again at
`Captures.js:153`. The second wins at runtime. See STOP conditions / maintenance
notes; do **not** fix it in this plan.

`MoodPins.js` (109 lines): `pins`, `add({ emotion, intensity, cause = null, note = null })`,
`patch(id, updates)`, `subscribe(cb)`, `recent(n = 7)`, `hydrate`,
`upsertBackend`, `serialize`.

`CalendarEvents.js` (65 lines): `events`, `forDate(date)`,
`inRange(startYMD, endYMD)`, `hydrate`, `hydrateBackend`, `serialize`,
`subscribe`. Read-only in v1.1 — the file's own header says "no add/remove path".

`Profile.js` (235 lines): `facets`, `identity`, `getFacet(facetId)`,
`displayCompanionName()`, `getQuotesForClaim(claimId)`, `countByClaim(facetId)`,
`forgetQuote(facetId, quoteId)`, `refine(facetId, partial)`,
`setIdentity(partial)`, `hydrate`, `hydrateBackend`, `serialize`, `subscribe`.

### The duplicated helpers

`formatLongDate` — **two copies, differing only in the null-vs-undefined
parameter**:

`src/components/student-space/sheets/DayDetailCard.tsx:14-26`:

```ts
function formatLongDate(ymd: string | null): string {
  if (!ymd) return ''
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return ymd
  }
}
```

`src/components/student-space/sheets/MirrorDetailSheet.tsx:359-371` — identical
body, signature `(ymd: string | undefined)`.

`eventDate` — **two byte-identical copies**:
`src/components/student-space/sheets/DayDetailCard.tsx:390-392` and
`src/components/student-space/sheets/CalendarPane.tsx:436-438`:

```ts
function eventDate(event: { entryDate?: string; date?: string }) {
  return event.entryDate || event.date || ''
}
```

The destination already exists and is already tested —
`src/lib/entry-date.ts` (26 lines, exports `sgDateKey` and `sgToday`) with
`test/lib/entry-date.test.ts`.

`StatTile` — **two copies with divergent prop types AND divergent visuals**.
`HistorySheet.tsx:625-638` (`value: string | number | undefined`, `{value ?? '—'}`,
`data-testid="stat-tile-value"`):

```tsx
    <div className="rounded-xl border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-3">
      <p data-testid="stat-tile-value" className="text-lg font-semibold tabular-nums text-(--color-sheet-ink)">
      <p className="text-xs text-(--color-sheet-ink-soft)">{label}</p>
```

`TrajectorySheet.tsx:489-498` (`value: string`, no fallback, no testid):

```tsx
    <div className="rounded-xl bg-white/55 px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(43,38,32,0.045),0_1px_0_rgba(255,255,255,0.65)_inset]">
      <p className="text-lg font-bold leading-none text-(--color-sheet-ink) tabular-nums">
      <p className="mt-1 text-xs font-semibold text-(--color-sheet-ink-soft)">{label}</p>
```

Call sites: `HistorySheet.tsx:616-619` (4 tiles) and
`TrajectorySheet.tsx:483-484` (2 tiles). **Read both functions in full before
step 5** — the visuals are genuinely different (bordered pane-left vs.
translucent inset-shadow raised) and preserving both exactly is mandatory.

### The 9 `as unknown as` casts

```
src/components/student-space/sheets/GrowthIslandPreview.tsx:54  renderer → configureColorPipeline param
src/components/student-space/sheets/HistorySheet.tsx:91         engine → { state?: EngineState }
src/components/student-space/sheets/LettersSheet.tsx:56          engine.state → { letters?: LettersSlice }
src/components/student-space/sheets/LettersSheet.tsx:115         engine → { view?: { overlayController?: OverlayControllerLike } }
src/components/student-space/sheets/MirrorDetailSheet.tsx:76     engine → { state?: MirrorEngineState & { captures?: Subscribable } }
src/components/student-space/sheets/SettingsSheet.tsx:63         engine → { state?: { onboarding?…; persistence?… } }
src/components/student-space/sheets/TrajectorySheet.tsx:127      engine → { state?: EngineState }
src/components/student-space/sheets/TrajectorySheet.tsx:156      engine → { view?: { overlayController?: OverlayCtl } }
src/components/student-space/sheets/TrajectorySheet.tsx:584      DIFFUSED_NUDGES → Array<{ title; prompt }>
```

`src/components/student-space/sheets/LettersSheet.tsx:113-115` is the clearest
example of a cast that exists only because a type is missing:

```ts
    type OverlayControllerLike = { open: (name: string, opts: unknown) => void }
    const overlay = (
      engine as unknown as { view?: { overlayController?: OverlayControllerLike } } | null
    )?.view?.overlayController
```

…and the real type it is re-inventing already exists at
`src/engine/student-space/Game/View/OverlayController.d.ts:30`:
`open(name: string, opts?: unknown): void`. The engine's `index.d.ts` simply
never declares a `view` property.

### Repo conventions

DOM surfaces are React 19 + Tailwind v4; the engine stays vanilla JS. Visual
primitives in `src/components/ui/*` are **hand-rolled shadcn-style** — do not
install `shadcn/ui`. Read `src/components/ui/badge.tsx` (38 lines) before
writing any new `ui/` component: it uses `cva` from
`class-variance-authority` for variants, `cn` from `~/lib/utils` for merging,
and exports both the component and its variants object.

Design tokens live in `@theme` in `src/styles.css` (`--color-sheet-*` etc.) —
use existing tokens, add none.

pnpm only, one root lockfile; `island-editor` is a workspace member.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed**. `pnpm vitest run <path>` for one file.
Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: never add `three` to `overrides` — the 0.149-app /
0.171-editor split is deliberate. (This plan adds no dependencies.)

`test/engine/colorspace-guard.test.ts` blocks r152+ three colour APIs — do not
trip it; this plan touches no rendering code.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Master gate | `pnpm check` | exit 0, 0 errors (18 warnings OK) |
| Typecheck only | `pnpm typecheck` | exit 0 |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| One file | `pnpm vitest run test/lib/entry-date.test.ts` | all pass |
| Sheet tests | `pnpm vitest run test/components/student-space/sheets` | all pass |
| Cast census | `grep -rn 'as unknown as' src/components/student-space/sheets/ \| wc -l` | 9 before, ≤7 after |

## Scope

**In scope** (the only files you should modify/create):

- `src/engine/student-space/Game/State/Captures.d.ts` (create)
- `src/engine/student-space/Game/State/MoodPins.d.ts` (create)
- `src/engine/student-space/Game/State/CalendarEvents.d.ts` (create)
- `src/engine/student-space/Game/State/Profile.d.ts` (create)
- `src/lib/student-space/capture-types.ts` (create)
- `src/engine/student-space/Game/index.d.ts` (step 6 only, types only)
- `src/lib/entry-date.ts`
- `src/components/ui/stat-tile.tsx` (create)
- `src/components/student-space/sheets/MirrorDetailSheet.tsx`
- `src/components/student-space/sheets/DayDetailCard.tsx`
- `src/components/student-space/sheets/HistorySheet.tsx`
- `src/components/student-space/sheets/CalendarPane.tsx`
- `src/components/student-space/sheets/TrajectorySheet.tsx`
- `src/components/student-space/sheets/LettersSheet.tsx` (step 6 only)
- `test/lib/entry-date.test.ts`
- `test/components/ui/stat-tile.test.tsx` (create)

**Out of scope** (do NOT touch, even though they look related):

- **Any `.js` file under `src/engine/student-space/`.** The engine is vanilla
  JS by doctrine; sidecars describe it, they do not change it. In particular:
  do NOT dedupe the duplicate `patch` in `Captures.js`, and do NOT add fields
  to `KNOWN_CAPTURE_KEYS`.
- The 10 existing `State/*.d.ts` sidecars — they are correct; leave them.
- `src/components/student-space/capture/*` (`AskSheet`, `MoodSheet`,
  `CaptureFab`) — they read the same slices, but widening them is a second
  wave. This plan is the History/Trajectory/Letters sheet cluster.
- `src/components/student-space/world/WorldInteractions.tsx` — it reads
  `state.profile` in ~15 places; step 6's `index.d.ts` widening could ripple
  there. If it does, that is a step-6 bail-out (see step 6), not a file to
  edit.
- Any runtime/behavior change: no new props with behavior, no changed defaults,
  no reordered effects, no `useMemo` additions. Plan 057 owns History-sheet
  memoization; do not pre-empt it.
- `src/styles.css` — reuse existing tokens; add none.
- `island-editor/`, `bird-builder/` — isolated workspace roots.

## Git workflow

- Branch: `advisor/061-typed-engine-capture-seam`
- One commit per step, e.g.
  `types(engine): add Captures/MoodPins/CalendarEvents/Profile sidecars`,
  `refactor(sheets): one canonical capture-entry type`,
  `refactor(lib): move formatLongDate + eventDate into entry-date`,
  `refactor(ui): extract StatTile with both sheet variants`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the four missing sidecars

Create the four `.d.ts` files next to their `.js` siblings, matching the
`Sprouts.d.ts` convention: a header comment explaining what the file is, then
exported types, then `export default class X { … }` declaring the runtime
surface listed in "Current state".

Derive every field and enum from `schema.js`, not from the sheets' inline
copies. Target shape for the capture one — `Captures.d.ts`:

```ts
// Companion declarations for Captures.js — the multimodal capture store.
// Mirrors the runtime shape produced by `mergeCapture` in ./schema.js, whose
// KNOWN_CAPTURE_KEYS allow-list (schema.js:216) is the authoritative field
// list for a capture entry.
//
// KEEP IN SYNC: a field added here but NOT added to KNOWN_CAPTURE_KEYS is
// silently dropped at the React↔engine seam on hydrate. Add it to both.

export type CaptureKind = 'ask' | 'photo' | 'trajectory'
export type CaptureDimension = 'values' | 'interests' | 'personality' | 'skills'
export type CaptureReviewStatus = 'pending' | 'confirmed' | 'forgotten'
export type CaptureSyncStatus = 'local' | 'syncing' | 'synced' | 'failed'

export interface CaptureReframe {
  headline?: string
  highlightPhrase?: string
  themes?: string[]
  needs?: string[]
  moods?: string[]
  edited?: boolean
}

export interface CaptureThreadMessage {
  role: 'kira' | 'you'
  text: string
}

export interface CaptureEntry {
  /** Always present — `add()` and `mergeCapture` both refuse an id-less entry. */
  id: string
  /** ISO timestamp stamped at `add()` time. */
  createdAt: string
  /** YYYY-MM-DD day key. Stamped by `Captures.add()`; always present. */
  entryDate: string
  kind: CaptureKind
  text?: string
  prompt?: string | null
  title?: string
  validation?: string
  dataUrl?: string
  caption?: string
  backendMirrorEntryId?: number | null
  backendCartographerOutputId?: number | null
  reviewStatus?: CaptureReviewStatus
  syncStatus?: CaptureSyncStatus
  syncError?: string
  contextType?: string
  reframe?: CaptureReframe
  thread?: CaptureThreadMessage[]
  trajectory?: unknown
  dimension?: CaptureDimension | null
  subClaimId?: string | null
  letterId?: string
}

export default class Captures {
  static instance: Captures | undefined
  static getInstance(): Captures | undefined

  entries: CaptureEntry[]

  constructor()

  add(payload: Partial<CaptureEntry> & { kind: CaptureKind }): CaptureEntry
  patch(id: string, updates: Partial<CaptureEntry>): CaptureEntry | null
  subscribe(cb: (entry: CaptureEntry, entries: readonly CaptureEntry[]) => void): () => void
  recent(n?: number): readonly CaptureEntry[]
  getPhoto(id: string): string | null
  findById(id: string): CaptureEntry | null
  hydrate(snapshot: unknown): void
  upsertBackend(snapshot: unknown): void
  serialize(): CaptureEntry[]
}
```

Two deliberate resolutions to inline in the file as comments:

- `entryDate` is **required**, resolving the copy-1/copy-2 disagreement.
  `Captures.add()` (`Captures.js:84-91`) always stamps it, and `mergeCapture`
  runs it through the allow-list. `MirrorDetailSheet`'s `entryDate?` was the
  drifted one.
- `reviewStatus` / `syncStatus` are the **narrow unions only**, never
  `| string`. `mergeCapture` (`schema.js:351-352`) rejects any value outside
  `REVIEW_STATES` / `SYNC_STATES`, so the runtime cannot produce anything else.
- `backendMirrorEntryId` is `number | null` (not `number | string`):
  `schema.js:347-350` rejects non-integers. Copies 1-4 all said
  `number | string`. **Expect fallout** — call sites doing
  `Number(capture.backendMirrorEntryId)` still compile; call sites comparing to
  a string may not. See STOP conditions.

Then `MoodPins.d.ts` (from `KNOWN_PIN_KEYS` + `MOOD_EMOTION` / `MOOD_INTENSITY`
/ `MOOD_CAUSE`), `CalendarEvents.d.ts` (from `KNOWN_EVENT_KEYS` +
`EVENT_KINDS`), `Profile.d.ts` (from `Profile.js`'s method list; type `facets`
and `identity` as narrowly as the file's own `hydrate` logic supports, and use
`unknown` where it genuinely is).

**Expected discovery — read this before writing `CalendarEvents.d.ts`.**
`KNOWN_EVENT_KEYS` is `['id', 'label', 'kind', 'date']`. There is **no
`entryDate` and no `title`** on a calendar event, and every path into
`CalendarEvents.events` goes through `mergeCalendarEvent`
(`CalendarEvents.js:21, 37, 47`), so those two fields can never exist at
runtime. Yet `HistorySheet.tsx:73-79` declares them, and
`eventDate()`'s `event.entryDate ||` branch plus `eventLabel()`'s
`event.title ??` branch (`DayDetailCard.tsx:390-397`) are therefore dead.
**Type `CalendarEvent` to the merger's real shape (`id`, `label`, `kind`,
`date`), keep the dead fallbacks in the helpers as harmless
belt-and-braces (widen the helper's parameter type to accept the optional
fields), and REPORT the finding.** Deleting the dead branches is a behavior-
adjacent change and this plan is types-only.

**Verify**: `pnpm check` → exit 0. (Nothing imports the new sidecars yet, so
this step must be a clean no-op for the compiler.)
**Verify**: `ls src/engine/student-space/Game/State/*.d.ts | wc -l` → `14`.

### Step 2: Export one canonical capture type

Create `src/lib/student-space/capture-types.ts` — a thin re-export so React
code never reaches into the engine's `State/` directory for types:

```ts
/**
 * The single canonical capture-entry type for React surfaces.
 *
 * Re-exports the engine's own declarations (Game/State/Captures.d.ts), which
 * mirror `mergeCapture`'s KNOWN_CAPTURE_KEYS allow-list in
 * Game/State/schema.js. Before this module existed the shape was re-declared
 * inline in four sheet files with drifted optionality — see plans/061.
 *
 * If you need a field the engine does not carry, add it to KNOWN_CAPTURE_KEYS
 * in schema.js AND to Captures.d.ts. A field added to only one is silently
 * dropped on hydrate.
 */
export type {
  CaptureDimension,
  CaptureEntry,
  CaptureKind,
  CaptureReframe,
  CaptureReviewStatus,
  CaptureSyncStatus,
  CaptureThreadMessage,
} from '~/engine/student-space/Game/State/Captures'

export type { MoodPin, MoodPinCause, MoodPinEmotion } from '~/engine/student-space/Game/State/MoodPins'
export type { CalendarEvent, CalendarEventKind } from '~/engine/student-space/Game/State/CalendarEvents'
```

(Adjust the exported names to whatever you actually declared in step 1.)

**Verify**: `pnpm check` → exit 0.

### Step 3: Point all four sheet copies at the canonical type

- `MirrorDetailSheet.tsx`: delete `interface MirrorCapture` (lines 18-35),
  import `CaptureEntry`, and replace `MirrorCapture` at every use site.
- `DayDetailCard.tsx`: delete `interface DayDetailCapture` (lines 28-49), same
  treatment.
- `HistorySheet.tsx`: in the local `EngineState` (lines 62-88), replace the
  inline `entries?: Array<{…}>` with `entries?: CaptureEntry[]`, the inline
  `pins?: Array<{…}>` with `pins?: MoodPin[]`, and the inline
  `events?: Array<{…}>` with `events?: CalendarEvent[]`.
- `HistorySheet.tsx`: in `resolveTargetDate` (lines 434-447), replace the
  inline `captures: Array<{…}>` parameter type with
  `captures: readonly CaptureEntry[]`.

Where a component genuinely only needs a subset, express it with `Pick<>` off
the canonical type rather than a fresh literal — e.g.
`Pick<CaptureEntry, 'id' | 'entryDate' | 'createdAt' | 'backendMirrorEntryId' | 'reviewStatus'>`.
The rule: **one source, narrowed by derivation, never re-typed by hand.**

**Verify**: `pnpm typecheck` → exit 0. Errors here are the point of the plan —
fix mechanically (see STOP conditions for the line).
**Verify**: `grep -n 'interface MirrorCapture\|interface DayDetailCapture' src/components/student-space/sheets/` → no matches.
**Verify**: `grep -c "reviewStatus?: 'pending' | 'confirmed' | 'forgotten' | string" src/components/student-space/sheets/*.tsx` → 0 across all files.
**Verify**: `pnpm vitest run test/components/student-space/sheets` → all pass.

### Step 4: Move `formatLongDate` and `eventDate` into `src/lib/entry-date.ts`

Append to `src/lib/entry-date.ts` (keep `sgDateKey` / `sgToday` untouched):

```ts
/**
 * "Monday, 20 July 2026" for a YYYY-MM-DD day key, in the viewer's locale.
 *
 * Deliberately parses `${ymd}T00:00:00` (local midnight, no `Z`) so the
 * rendered date matches the day key the caller passed rather than shifting a
 * day in a negative-offset timezone. Returns '' for missing input and echoes
 * the raw input if Intl throws.
 */
export function formatLongDate(ymd: string | null | undefined): string {
  if (!ymd) return ''
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ymd
  }
}

/**
 * Day key for a calendar event. The engine's merger (schema.js
 * KNOWN_EVENT_KEYS) only carries `date`; the `entryDate` arm is retained as
 * belt-and-braces for any non-merger-sourced event object.
 */
export function eventDate(event: { entryDate?: string; date?: string }): string {
  return event.entryDate || event.date || ''
}
```

The union parameter `string | null | undefined` reconciles the two divergent
signatures (`DayDetailCard`: `string | null`; `MirrorDetailSheet`:
`string | undefined`) without narrowing either caller.

Then delete the four local copies and add imports:
- `DayDetailCard.tsx:14-26` (`formatLongDate`) and `:390-392` (`eventDate`)
- `MirrorDetailSheet.tsx:359-371` (`formatLongDate`)
- `CalendarPane.tsx:436-438` (`eventDate`)

`DayDetailCard.tsx:4` and `CalendarPane.tsx` already import from
`~/lib/entry-date` — extend the existing import statement rather than adding a
second one.

Extend `test/lib/entry-date.test.ts` with two new describes (model them on the
existing `describe('sgDateKey', …)` block):

- `formatLongDate`: a known day key renders with weekday+day+month+year (assert
  with a regex so it survives locale differences, e.g.
  `expect(formatLongDate('2026-07-20')).toMatch(/2026/)` plus
  `expect(formatLongDate('2026-07-20')).toContain('July')` guarded by
  `toLocaleDateString` availability); `null` → `''`; `undefined` → `''`;
  `''` → `''`; a garbage key (`'not-a-date'`) echoes the input rather than
  rendering `Invalid Date`.
- `eventDate`: `{ date: '2026-07-20' }` → `'2026-07-20'`;
  `{ entryDate: '2026-07-19', date: '2026-07-20' }` → `'2026-07-19'`
  (entryDate wins — pin the existing precedence);
  `{}` → `''`.

**Verify**: `pnpm vitest run test/lib/entry-date.test.ts` → all pass, including
the new cases.
**Verify**: `grep -rn 'function formatLongDate\|function eventDate' src/` →
exactly 2 matches, both in `src/lib/entry-date.ts`.
**Verify**: `pnpm check` → exit 0.

### Step 5: Extract `StatTile` into `src/components/ui/stat-tile.tsx`

**The two visual treatments must be preserved byte-for-byte.** Use `cva` the
way `src/components/ui/badge.tsx:5-28` does, with one variant per existing
look:

```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

/**
 * Small labelled stat, used in the History summary strip and the Trajectory
 * pathway strip. Extracted from two divergent local copies (plans/061); the
 * two `variant` values preserve each surface's original look exactly.
 */
const statTileVariants = cva('rounded-xl', {
  variants: {
    variant: {
      // History summary strip (was HistorySheet.tsx StatTile).
      bordered: 'border border-(--color-sheet-divider) bg-(--color-sheet-pane-left) p-3',
      // Trajectory pathway strip (was TrajectorySheet.tsx StatTile).
      raised:
        'bg-white/55 px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(43,38,32,0.045),0_1px_0_rgba(255,255,255,0.65)_inset]',
    },
  },
  defaultVariants: { variant: 'bordered' },
})

// Inner-element classes diverge per variant too — keep them as plain maps.
const VALUE_CLASS = {
  bordered: 'text-lg font-semibold tabular-nums text-(--color-sheet-ink)',
  raised: 'text-lg font-bold leading-none text-(--color-sheet-ink) tabular-nums',
} as const
const LABEL_CLASS = {
  bordered: 'text-xs text-(--color-sheet-ink-soft)',
  raised: 'mt-1 text-xs font-semibold text-(--color-sheet-ink-soft)',
} as const

export interface StatTileProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof statTileVariants> {
  /** Widened union reconciling the two former copies (`string | number | undefined` and `string`). */
  value: string | number | undefined
  label: string
}

export function StatTile({
  value,
  label,
  variant = 'bordered',
  className,
  ...props
}: StatTileProps) {
  return (
    <div className={cn(statTileVariants({ variant }), className)} {...props}>
      <p data-testid="stat-tile-value" className={VALUE_CLASS[variant]}>
        {value ?? '—'}
      </p>
      <p className={LABEL_CLASS[variant]}>{label}</p>
    </div>
  )
}

export { statTileVariants }
```

Notes: `value` takes the **wider** union, which accepts every existing call
site. `{value ?? '—'}` is unreachable on the `raised` variant (Trajectory always
passes a non-nullish string — `String(count)`, `relativeTime(generatedAt)`), so
the rendered output is unchanged. Keep `data-testid="stat-tile-value"` on both
variants; adding it to `raised` is additive and harmless.

Then delete the two local `StatTile` functions and import the shared one:
- `HistorySheet.tsx:625-638` deleted; call sites at `:616-619` become
  `<StatTile variant="bordered" … />` (or omit `variant` — `bordered` is the
  default).
- `TrajectorySheet.tsx:489-498` deleted; call sites at `:483-484` become
  `<StatTile variant="raised" … />`.

Create `test/components/ui/stat-tile.test.tsx` (React Testing Library — the
repo already uses `@testing-library/react`; model on any existing
`test/components/**` test):

- renders the value and label
- `value={undefined}` renders the `—` fallback
- `variant="bordered"` applies the border class; `variant="raised"` does not
  (assert via `className` containing/not-containing `border-(--color-sheet-divider)`)
- omitting `variant` behaves as `bordered`

**Verify**: `pnpm vitest run test/components/ui/stat-tile.test.tsx` → all pass.
**Verify**: `grep -rn 'function StatTile' src/` → exactly 1 match, in
`src/components/ui/stat-tile.tsx`.
**Verify**: `pnpm vitest run test/components/student-space/sheets` → all pass
(no snapshot/class assertions broke — if one did, the extracted classes drifted
from the originals; fix the classes, not the test).
**Verify**: `pnpm check` → exit 0.

### Step 6: Delete the casts the new types make unnecessary — only where the compiler proves it

Two mechanical wins are expected. Attempt them in this order, and **revert
immediately if either ripples beyond the in-scope file list**.

**6a — declare `view.overlayController` on the engine's public type.** In
`src/engine/student-space/Game/index.d.ts`, add to the `Game` interface (types
only, no runtime change):

```ts
  /**
   * Compatibility bridge for imperative engine callers that open non-routed
   * capture overlays (`ask`, `mood`, `chooser`). Routed sheets are URL-owned;
   * this is the seam React surfaces use to hand a prompt to the world route.
   */
  view?: {
    overlayController?: import('./View/OverlayController').default
  }
```

Then delete the ad-hoc `OverlayControllerLike` type and its cast at
`LettersSheet.tsx:113-115`, and the `OverlayCtl` cast at
`TrajectorySheet.tsx:156`, replacing both with a direct
`engine?.view?.overlayController`. The already-declared signature
(`OverlayController.d.ts:30` — `open(name: string, opts?: unknown): void`)
matches both call sites.

**6b — widen `state.captures` / `moodPins` / `calendar` / `profile`.** In the
same file, replace the `subscribe`-only stubs with the sidecar types:

```ts
  state: {
    onboarding: { subscribe(listener: (event: unknown, context: unknown) => void): () => void }
    moodPins: import('./State/MoodPins').default
    profile: import('./State/Profile').default
    captures: import('./State/Captures').default
    calendar?: import('./State/CalendarEvents').default
    auth: { ... }      // unchanged
    sprouts: { ... }   // unchanged
  }
```

…and update the "Public state surface" docblock above it to stop saying these
are reachable only via `(game.state as any)`.

**Then run `pnpm typecheck` and read the error list before editing anything
else.** 6b is the risky half: `WorldInteractions.tsx` reads `state.profile` in
~15 places and is explicitly out of scope.

- **If `pnpm typecheck` is clean**: delete the `as unknown as { state?: … }`
  casts at `HistorySheet.tsx:91`, `MirrorDetailSheet.tsx:76`, and
  `TrajectorySheet.tsx:127`, along with the now-redundant local `EngineState`
  type declarations they served.
- **If errors appear only inside the in-scope sheet files**: fix them
  mechanically (add a `?.`, narrow with the canonical type).
- **If errors appear in `WorldInteractions.tsx`, `ProfileSheet.tsx`, the
  `capture/` components, or anywhere else outside Scope**: `git checkout --`
  the `index.d.ts` 6b hunk, keep 6a, and report the error list. 6b then becomes
  a follow-up plan. **This is an expected, acceptable outcome — do not chase
  it.**

Expected end state for the cast census: 9 → 7 if only 6a lands; 9 → 4 if 6b
lands too. The remaining casts and why they stay:
`GrowthIslandPreview.tsx:54` (three.js renderer param — unrelated),
`LettersSheet.tsx:56` (`letters` slice — `TeacherLetters.js` has no sidecar and
is out of scope), `SettingsSheet.tsx:63` (`onboarding.reset` /
`persistence.flush` — `Onboarding.js` has no sidecar),
`TrajectorySheet.tsx:584` (a local constants array — unrelated).
**List whichever remain in your completion report.**

**Verify**: `pnpm check` → exit 0.
**Verify**: `pnpm test` → 0 failed, ≥911 passed.
**Verify**: `grep -rn 'as unknown as' src/components/student-space/sheets/ | wc -l`
→ `7` or `4` (report which, and name each survivor).

### Step 7: Final gate

**Verify**: `pnpm check` → exit 0, 0 errors, ≤18 warnings.
**Verify**: `pnpm test` → ≥911 passed + the new tests, **0 failed**, skip count
still 128.
**Verify**: `git status` → only in-scope files modified/created.
**Verify**: `git diff --stat -- 'src/engine/student-space/**/*.js'` → **empty**
(no engine JS touched).

## Test plan

- `test/lib/entry-date.test.ts` — extend with `describe('formatLongDate')`
  (5 cases: known key, `null`, `undefined`, `''`, garbage-echoes-input) and
  `describe('eventDate')` (3 cases: `date` only, `entryDate` wins over `date`,
  empty object). Pattern: the existing `describe('sgDateKey', …)` block in the
  same file.
- `test/components/ui/stat-tile.test.tsx` (new, 4 cases) — value+label render,
  `undefined` → `—`, `bordered` vs `raised` class application, default variant.
  Pattern: any existing `test/components/**` RTL test.
- **No new tests for the sidecars themselves.** `.d.ts` files are verified by
  `tsc --noEmit`; that *is* their test, and `pnpm check` is the gate.
- Regression coverage for the plan's own thesis: after step 3, a field
  mismatch between a sheet and `Captures.d.ts` is a compile error rather than a
  silent runtime `undefined`. `pnpm typecheck` exiting 0 is the assertion.
- Existing sheet tests (`test/components/student-space/sheets/*`) must pass
  **unchanged** — this plan changes no behavior. A sheet test that needs
  editing is a signal you changed runtime behavior; see STOP conditions.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0 with 0 errors
- [ ] `pnpm test` exits 0, 0 failed, skip count still 128
- [ ] `ls src/engine/student-space/Game/State/*.d.ts | wc -l` → `14`
- [ ] `src/lib/student-space/capture-types.ts` exists and exports `CaptureEntry`
- [ ] `grep -rn 'interface MirrorCapture\|interface DayDetailCapture' src/` → no matches
- [ ] `grep -rn "| 'forgotten' | string" src/components/` → no matches
- [ ] `grep -rn 'function formatLongDate\|function eventDate' src/` → exactly 2 matches, both in `src/lib/entry-date.ts`
- [ ] `grep -rn 'function StatTile' src/` → exactly 1 match, in `src/components/ui/stat-tile.tsx`
- [ ] `grep -rn 'as unknown as' src/components/student-space/sheets/ | wc -l` → ≤7 (was 9), with each survivor named in the report
- [ ] `git diff --stat -- 'src/engine/student-space/**/*.js'` → empty
- [ ] `git diff --stat -- src/styles.css` → empty
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **A surfaced type error implies a genuine runtime bug** rather than a
  permissive-type artifact. The dividing line: *mechanical* means adding a
  `?.`, a `?? fallback`, a `Number(...)`, or narrowing a parameter type.
  *Not mechanical* means the sheet reads a field the engine never writes, or
  writes a value the merger would reject — that is a real bug, and it needs its
  own fix with its own test. Report it with the file, line, and the field.
  Concretely expected: `backendMirrorEntryId` narrowing from
  `number | string` to `number | null` may surface a call site that compares it
  to a string. If so, report it — do **not** widen the sidecar back to
  `number | string` to make the error go away; the sidecar mirrors
  `schema.js:347-350`, which rejects non-integers.
- **Step 6b ripples outside Scope** (`WorldInteractions.tsx`, `ProfileSheet.tsx`,
  `capture/*`). Revert the 6b hunk, keep 6a, report the error list. This is an
  expected outcome, not a failure.
- **Any existing test in `test/components/student-space/sheets/` needs
  editing.** This plan changes no behavior, so a failing sheet test means
  either the extracted `StatTile` classes drifted from the originals (fix the
  classes) or you changed runtime behavior (revert). Do not adjust the test.
- **You are tempted to edit an engine `.js` file** — including deduping the
  double `patch` in `Captures.js:117` and `:153`, or adding a field to
  `KNOWN_CAPTURE_KEYS`. Both are out of scope. Report instead.
- More than **12** type errors appear after step 3 — that means the inline
  copies were hiding more drift than audited, and the plan needs re-scoping
  rather than a long mechanical grind.
- The excerpts in "Current state" do not match the live code (drift since
  planning).

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**, in priority order:
  1. That `Captures.d.ts` matches `KNOWN_CAPTURE_KEYS` in `schema.js` **field
     for field**. A sidecar that drifts from the allow-list is worse than no
     sidecar: it makes the compiler confidently wrong. Diff the two lists by
     eye in the PR.
  2. That the two `StatTile` variants render **identically** to the deleted
     copies. Compare the class strings in the diff against the "Current state"
     excerpts; a dropped `leading-none` or `mt-1` is a visual regression the
     tests will not catch.
  3. That no engine `.js` file appears in the diff.
  4. That `reviewStatus` / `syncStatus` are narrow unions everywhere, with no
     `| string` escape hatch reintroduced.
- **The standing rule this establishes**: a new capture field requires three
  edits, always together — `KNOWN_CAPTURE_KEYS` in `schema.js`, `CaptureEntry`
  in `Captures.d.ts`, and (if the merger needs to validate it) a branch in
  `mergeCapture`. Two out of three means the field is silently dropped or
  silently untyped.
- **Reported findings this plan deliberately does not fix**:
  - `Captures.js` defines `patch()` twice (lines 117 and 153); the second
    definition wins. Harmless today (the bodies are near-identical) but it is a
    lint-invisible landmine. Engine-JS change, needs its own plan.
  - Calendar events cannot carry `entryDate` or `title` (`KNOWN_EVENT_KEYS` is
    `id, label, kind, date`), so the `entryDate ||` and `title ??` fallbacks in
    `eventDate` / `eventLabel` are dead. Retained as belt-and-braces because
    removing them is behavior-adjacent.
- **Deferred by design**: sidecars for `TeacherLetters.js` and `Onboarding.js`,
  which would retire the remaining `LettersSheet.tsx:56` and
  `SettingsSheet.tsx:63` casts; and widening
  `src/components/student-space/capture/*` onto the canonical type. Both are
  the same recipe applied to a second cluster — worth a follow-up once this
  one has settled.
- **Plan interaction**: plan 047 touches capture sync fields
  (`syncStatus`/`syncError`) and plan 057 memoizes History-sheet derived data
  in the same files. Land 061 before 057 (057's `useMemo` calls want a real
  type to key on); land 047 before 061 if 047 is already in flight.
