# Plan 039: Stop the ~60 Hz React re-render while hovering world objects

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- src/components/student-space/world/WorldInteractions.tsx test/engine/HoverProbe.performance.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

While the pointer rests on any hoverable world object (the bird, a flower, the
tree, the mailbox, the telescope), the engine's per-frame hover probe calls
`setAnchor(...)` every requestAnimationFrame tick, and `setAnchor` always
allocates a fresh state object. That means React reconciles the entire
`WorldInteractions` overlay subtree (`KiraBubble`, `HoverCtaChip`,
`ObjectPeekPopover`, `NarratorPanel`, `ObjectPickupPanel`) at ~60 Hz for the
whole duration of a hover — exactly when a demo presenter pauses the mouse
over the scene to talk. The repo already has an established pattern for
per-frame screen-position updates that bypass React entirely
(`use-world-position.ts`); this plan applies the same idea to the hover CTA
chip's anchor.

## Current state

Relevant files:

- `src/components/student-space/world/WorldInteractions.tsx` — all the code
  this plan touches. Contains the React component (state + JSX), the
  `HoverCtaController` (bridges engine → React state), and the
  `HoverProbeController` (engine-side per-frame raycaster that drives it).
- `src/lib/student-space/use-world-position.ts` — the repo's exemplar for
  "per-frame position without React re-render" (read it before starting; do
  not modify it).
- `test/engine/HoverProbe.performance.test.ts` — the structural pattern for
  unit-testing these controllers without a real engine.

The React state and its consumer (`WorldInteractions.tsx:213`, `:305`):

```tsx
// :213
const [hoverCta, setHoverCta] = useState(INITIAL_HOVER_CTA)
// :305 (in the returned JSX)
<HoverCtaChip state={hoverCta} />
```

The controller is constructed inside an effect and handed the raw setter
(`WorldInteractions.tsx:251`, `:255`):

```tsx
const hoverCtaController = new HoverCtaController(deps, setHoverCta)
view.hoverCta = hoverCtaController
```

`HoverCtaController` (`WorldInteractions.tsx:756-867`, abridged):

```tsx
class HoverCtaController {
  view: AnyEngine
  target: Target | null = null
  _thumbs: AnyEngine = null

  constructor(
    private deps: EngineDeps,
    private setHoverCta: Dispatch<SetStateAction<HoverCtaState>>,
  ) {
    this.view = deps.View.getInstance()
  }

  showFor(target: Target, screenX: number, screenY: number) {
    this.target = target
    this._renderContent(target)
    this.setAnchor(screenX, screenY)
    this.setHoverCta((prev) => ({ ...prev, open: true }))
  }
  // ... _renderContent / _setContent / _thumbUrl ...

  setAnchor(screenX: number, screenY: number) {                     // :848
    this.setHoverCta((prev) => ({ ...prev, x: screenX + 16, y: screenY - 12 }))
  }

  hide() {                                                          // :852
    this.target = null
    this.setHoverCta((prev) => ({ ...prev, open: false }))
  }

  dispose() {                                                       // :857
    try { this._thumbs?.dispose?.() } catch {}
    this._thumbs = null
    this.target = null
    this.setHoverCta(INITIAL_HOVER_CTA)
  }

  update() {}
}
```

The per-frame caller — `HoverProbeController.update()`
(`WorldInteractions.tsx:1495-1503`):

```tsx
if (this.hovered) {
  const t = this.state.time.elapsed
  this.ring.material.opacity = 0.55 + 0.25 * Math.sin(t * Math.PI * 2 * RING_PULSE_HZ)
}
if (this.hovered && this.view.hoverCta) {
  const pos = this._screenPos(this.hovered)
  this.view.hoverCta.setAnchor(pos.x, pos.y)
}
```

Note the contrast in the same block: the ring pulse mutates a three.js
material directly (no React), while the anchor goes through `setHoverCta`.
Because `setAnchor` builds a new object every call, React re-renders every
frame **even when the camera is stationary and x/y haven't changed**.

The chip consumes `x`/`y` as `left`/`top` inline styles
(`WorldInteractions.tsx:1707-1725`, abridged):

```tsx
function HoverCtaChip({ state }: { state: HoverCtaState }) {
  return (
    <div
      role="tooltip"
      aria-hidden={!state.open}
      data-world-hover-cta
      style={{
        left: state.x,
        top: state.y,
        '--cta-accent': state.theme?.accent,
        // ...
      } as CSSProperties}
      className={cn(
        'pointer-events-none fixed z-[26] ... transition-[opacity,transform] duration-[160ms] ...',
        state.open ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
```

**Critical constraint**: the chip's open/close animation transitions
`transform` (`translate-y-1` → `translate-y-0` with
`transition-[opacity,transform]`). Therefore the anchor position must keep
using `left`/`top` — moving positioning into `transform` would fight the
Tailwind translate classes and smear every anchor move through the 160 ms
transition. When writing the DOM directly, write `style.left`/`style.top`.

Repo conventions that apply:

- The engine↔React seam rule (from `CLAUDE.md`): per-frame position updates
  bypass React — `use-world-position.ts` "mutates `style.transform` /
  `opacity` directly per frame (no React in the hot path)". This plan extends
  that convention to `left`/`top` for the hover chip.
- `HoverProbeController` is already `export`ed at
  `WorldInteractions.tsx:1329` specifically so `test/engine/HoverProbe.performance.test.ts`
  can unit-test it. Follow that precedent when exporting `HoverCtaController`.
- Formatting/lint is Biome (`pnpm lint`); TS strict (`pnpm typecheck`).

The existing test's construction pattern
(`test/engine/HoverProbe.performance.test.ts:22-51`): it `vi.mock`s
`View.js`/`State.js`, then assembles a controller with
`Object.assign(Object.create(HoverProbeController.prototype), {...stubs})`
and calls methods directly. Model the new test on this file.

There are currently **no React-render tests** for `WorldInteractions` (only
the controller-level test above), so the test plan below stays at the
controller level.

## Commands you will need

| Purpose            | Command                                                        | Expected on success |
|--------------------|----------------------------------------------------------------|---------------------|
| Install            | `pnpm install`                                                 | exit 0              |
| Lint + typecheck   | `pnpm check`                                                   | exit 0 (18 pre-existing lint warnings are OK; 0 errors) |
| Full tests         | `pnpm test`                                                    | see note below      |
| Targeted tests     | `pnpm vitest run test/engine/HoverProbe.performance.test.ts test/engine/HoverCta.anchor.test.ts` | all pass |

Note: at the planned-at commit, `pnpm test` has **10 pre-existing failures in
5 files** (history-sheet, trajectory-sheet, dev.pipeline, student-space-host,
edupass-login) that are unrelated to this plan (they are fixed by plans
033/034). Your bar: no *new* failures beyond those, and your targeted tests
pass.

## Scope

**In scope** (the only files you should modify):

- `src/components/student-space/world/WorldInteractions.tsx`
- `test/engine/HoverCta.anchor.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `HoverProbeController._pick` / raycast batching — a separate audit finding,
  deliberately not in this plan.
- Any change to open/close logic, popover behavior, `KiraBubble` (its `x`/`y`
  are driven by a different controller on a different cadence), or the chip's
  visual design/classNames beyond removing `left`/`top` from React state.
- `src/lib/student-space/use-world-position.ts` — read-only exemplar.
- Engine files under `src/engine/`.

## Git workflow

- Branch: `advisor/039-hover-cta-anchor-no-rerender`
- Conventional commits, matching repo style (e.g.
  `perf(world): hover CTA anchor writes the DOM directly — no per-frame React re-render`)
- Do NOT push or open a PR unless the operator instructed it.

## Approach

Two acceptable fixes, in preference order:

- **(a) Preferred — move the anchor out of React state onto a direct DOM
  write**, following the `use-world-position.ts` convention. Keep `open` and
  all content fields in React state (they change once per hover, which is
  fine); only `x`/`y` move to imperative writes.
- **(b) Minimum fallback — short-circuit `setAnchor` when x/y are unchanged**
  since the last call. This fully fixes the stationary-camera case (the
  common one: pointer resting, camera idle), but during camera tweens the
  position genuinely changes every frame, so re-renders return exactly when
  the frame budget is tightest. Only fall back to (b) if (a) hits a STOP
  condition; record which fix you shipped in the plans/README.md status row.

The steps below implement (a).

## Steps

### Step 1: Export `HoverCtaController` and give it an anchor element

In `src/components/student-space/world/WorldInteractions.tsx`:

1. Change `class HoverCtaController {` (line ~756) to
   `export class HoverCtaController {` (same precedent as
   `HoverProbeController` at line ~1329).
2. Add to the class:
   - a field `_anchorEl: HTMLElement | null = null` and
     `_lastX = Number.NaN`, `_lastY = Number.NaN`;
   - a method `setAnchorElement(el: HTMLElement | null)` that stores the
     element and, when `el` is non-null and `_lastX`/`_lastY` are finite,
     immediately applies the last known position (so a chip that mounts after
     the first `showFor` still lands in place).
3. Rewrite `setAnchor` to write the DOM instead of React state:

```tsx
setAnchor(screenX: number, screenY: number) {
  const x = screenX + 16
  const y = screenY - 12
  if (x === this._lastX && y === this._lastY) return
  this._lastX = x
  this._lastY = y
  const el = this._anchorEl
  if (!el) return
  // left/top, NOT transform: the chip's open/close animation transitions
  // `transform`, so positioning must stay off that property.
  el.style.left = `${x}px`
  el.style.top = `${y}px`
}
```

4. In `dispose()`, also reset `_anchorEl = null` and the `_lastX`/`_lastY`
   sentinels.

**Verify**: `pnpm typecheck` → exits 0 (expect errors only if step 2's chip
changes are pending — in that case proceed to Step 2 first, then verify both
together).

### Step 2: Wire the chip to the controller and drop `x`/`y` from React state

Still in `WorldInteractions.tsx`:

1. Remove `x` and `y` from the `HoverCtaState` type and from
   `INITIAL_HOVER_CTA` (declared just above line 180; it currently spreads
   content fields — find the `open`/`x`/`y` members near it).
2. In the `WorldInteractions` component, create a stable ref callback that
   forwards the chip's DOM node to the controller in `controllersRef`:

```tsx
const hoverCtaAnchorRef = useCallback((node: HTMLDivElement | null) => {
  controllersRef.current.hoverCta?.setAnchorElement(node)
}, [])
```

   and ALSO call `hoverCtaController.setAnchorElement(...)` right after the
   controller is constructed in the boot effect (line ~251), reading the node
   from a `useRef<HTMLDivElement | null>` that the ref callback keeps — the
   controller is created asynchronously (dynamic imports resolve after
   mount), so the ref callback alone fires too early. Concretely: keep a
   `hoverCtaNodeRef = useRef<HTMLDivElement | null>(null)`; the ref callback
   sets `hoverCtaNodeRef.current = node` **and** forwards to the controller
   if it already exists; the boot effect calls
   `hoverCtaController.setAnchorElement(hoverCtaNodeRef.current)` after
   constructing it. The cleanup path (line ~276-294) should call
   `setAnchorElement(null)` via the controller before clearing
   `controllersRef`.
3. Pass the ref into the chip: `<HoverCtaChip state={hoverCta} anchorRef={hoverCtaAnchorRef} />`.
4. In `HoverCtaChip`, accept `anchorRef: RefCallback<HTMLDivElement>`, attach
   it to the root div (`ref={anchorRef}`), and delete `left: state.x` /
   `top: state.y` from the inline style (keep the CSS-variable entries).
5. Remove the now-dead `x`/`y` writes: `setAnchor` no longer touches state
   (done in Step 1); check `showFor` still calls `setAnchor` (it does — that
   call now writes the DOM before the `open: true` state update, which is the
   correct order: position first, then reveal).

**Verify**: `pnpm check` → exit 0, no NEW lint errors, no type errors.
`grep -n "state.x\|state.y" src/components/student-space/world/WorldInteractions.tsx`
→ no matches inside `HoverCtaChip` (matches in `KiraBubble` AND in
`ObjectPeekPopover` — which has its own `left: state.x`/`top: state.y` around
line 1816 — are fine; both are out of scope and intentionally survive).

### Step 3: Unit test — anchor updates don't call the React setter

Create `test/engine/HoverCta.anchor.test.ts`, modeled structurally on
`test/engine/HoverProbe.performance.test.ts` (same `vi.mock` of `View.js` and
`State.js`, same `Object.create(prototype)` assembly — `HoverCtaController`'s
constructor calls `deps.View.getInstance()`, so prototype-assembly avoids
needing full `EngineDeps`). Cases:

1. **`setAnchor` never calls the state setter**: assemble a controller with
   `setHoverCta: vi.fn()`, `_anchorEl` set to a stub
   `{ style: {} as CSSStyleDeclaration }` (happy-dom: `document.createElement('div')`
   works too), call `setAnchor(100, 200)`, assert `setHoverCta` was **not**
   called and `el.style.left === '116px'`, `el.style.top === '188px'`.
2. **Identical coords are a no-op**: call `setAnchor(100, 200)` twice; spy on
   the element (or replace `el.style` between calls) and assert the second
   call wrote nothing (e.g. reset `el.style.left = ''` after the first call,
   call again with the same coords, assert it is still `''`).
3. **Null element is safe**: `_anchorEl = null`, `setAnchor(5, 5)` does not
   throw, and a later `setAnchorElement(el)` applies the stored position.
4. **`showFor` still opens via React state**: with a `setHoverCta` spy,
   call `showFor(target, x, y)` with a minimal target (e.g.
   `{ kind: 'kira' }` — its `_renderContent` branch reads nothing else) and
   assert `setHoverCta` WAS called (content + open still flow through React).

**Verify**: `pnpm vitest run test/engine/HoverCta.anchor.test.ts` → all 4 pass.

### Step 4: Full gates

**Verify**:
- `pnpm check` → exit 0 (0 errors).
- `pnpm vitest run test/engine/` → all pass.
- `pnpm test` → no failures beyond the 10 pre-existing ones listed in
  "Commands you will need" (if plans 033/034 have landed by the time you run,
  expect 0 failures).

## Test plan

Covered by Step 3 (4 new controller-level cases in
`test/engine/HoverCta.anchor.test.ts`, patterned on
`test/engine/HoverProbe.performance.test.ts`). No React-render test is added:
`WorldInteractions` has no existing component test to extend, and the
controller-level assertions ("setter not called from setAnchor") pin the
regression directly.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `pnpm vitest run test/engine/HoverCta.anchor.test.ts` → 4/4 pass
- [ ] `grep -n "setHoverCta" src/components/student-space/world/WorldInteractions.tsx`
      shows NO call inside the `setAnchor` method body
- [ ] `grep -c "left: state.x" src/components/student-space/world/WorldInteractions.tsx` → `1` (the surviving match is `ObjectPeekPopover`'s — out of scope; the count is 2 before this plan, and `HoverCtaChip`'s is the one removed)
- [ ] `pnpm test` → no new failures vs. the 10 pre-existing ones
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `HoverCtaController` / `HoverProbeController.update()` / `HoverCtaChip`
  code does not match the "Current state" excerpts (drift).
- The chip's position visibly lags or jumps relative to today's behavior in a
  quick manual check (`pnpm dev`, hover the bird/tree while orbiting) — i.e.
  the ref-wiring ordering in Step 2 turns out not to deliver the node to the
  controller before the first `showFor`. Report rather than adding
  setTimeout/polling hacks; fix (b) (short-circuit only) is the sanctioned
  fallback.
- Removing `x`/`y` from `HoverCtaState` breaks a consumer outside
  `HoverCtaChip` (grep first: `grep -n "hoverCta\." src/components/student-space/world/WorldInteractions.tsx`
  — if anything other than the controller reads `.x`/`.y` from that state,
  stop).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any future feature that wants the chip to *animate* between anchor
  positions must not simply move positioning into `transform` — the open/close
  animation owns that property. Introduce a wrapper element instead.
- If `WorldInteractions` ever gets component-level tests, add one that mounts
  the chip and asserts render count stays flat across `setAnchor` calls.
- The same "controller holds a setState and is called per-frame" shape exists
  in `KiraDialogueController` (drives `KiraBubble` `x`/`y`). It was not
  flagged (its update cadence is dialogue-driven), but if the bubble ever
  becomes hover-tracked, apply this plan's pattern there too.
