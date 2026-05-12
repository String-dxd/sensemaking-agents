# World Studio — Flow & Layout Reorder (Plan)

**Status:** active (initial)
**Date:** 2026-05-12
**Type:** feat
**Author:** initial draft by Claude (ce-plan)

---

## 1. Summary

Reshape the app's information architecture and capture flow to match the new "world studio" screenshots:

- **`/` becomes the world stage** (placeholder 3D + chat input + `+ Capture`). The library cards UI is replaced by **pull-up bottom sheets** for V / I / P / S + Trajectory.
- **Voice mode lives on the world view**, not on a separate page. The user taps a voice button on `/`, the world stage stays visible while they talk aloud, and on Stop the audio runs straight through transcribe → Mirror → persist → review. No camera, no video element, no flipped self-image. The `/reflect` route is deprecated this plan; only `/reflect/review` remains as a destination.
- **Emotion is inferred by Mirror** and surfaces in the review alongside `validation` / `inferred_meaning` / `story_reframe`. The user can **optionally** tag their own emotion **during** voice mode via a small chip — never blocking, never required.
- **VIPS dimension pages keep their current shape** (compiled_truth paragraph + chronological timeline + per-entry forget). They render inside bottom sheets opened from the world view; the route at `/library/$dimension` is unchanged.
- **`/library` becomes the central all-VIPS view**, reached from a new Library button on the world view. The existing `LibraryIndexPage` (4-card grid for V/I/P/S + "Run sense-making" CTA + counsellor-brief export) is the one-place-to-see-everything; the per-dimension sheets on `/` are for quick drill-in.

Goal of this plan is **structural** — get the flow and layout right with placeholders. Visual polish, real threejs scene, sheet physics, and the emotion taxonomy are explicitly deferred.

---

## 2. Non-goals (explicit)

- **Not** implementing the real threejs scene — `WorldStage` ships as a static placeholder (gradient sky + simple SVG island silhouette) with a clear extension seam.
- **Not** changing Connector or Cartographer semantics. **Mirror is extended** with one new output field, `inferred_emotion`, from the closed `MoodSchema` enum — existing `validation` / `inferred_meaning` / `story_reframe` outputs are untouched.
- **Not** using the camera or webcam in any form. The `webcam-as-mirror` ritual from v0.1 (flipped self-image, square aspect ring, volume ring overlay on video) is **retired** by this plan. Audio capture only.
- **Not** restructuring the VIPS dimension page layout. `VipsPageView` keeps its current render exactly as shipped in the v0.2 wiki pivot. Eyebrow / title / buckets restructure is deferred entirely — see U4.
- **Not** replacing the `VipsContextType` schema. The 5-type enum stays; the new `mood` is additive.
- **Not** finalizing the 9-emotion taxonomy choices (Joy/Sadness/.../Ennui are placeholders matching the screenshot intent) or wiring emotion into VIPS parallax tagging. That's a follow-up plan. This plan wires emotion *inference* into Mirror and surfaces it in review — but does not let it influence Connector / Cartographer logic yet.
- **Not** implementing sheet physics / gestures / scroll-snapping / mobile drag. Bottom sheets render as a simple drawer; transitions and gesture work come later.
- **Not** doing visual polish (final typography scale, palette tuning, motion).
- **Not** migrating away from the existing top-nav shell on routes that aren't yet folded into the world view — `/reflect` and `/reflect/review` keep their current header until follow-up.
- **Not** shipping the "Only you" visibility indicator. The placeholder version was dropped during plan review because privacy-implying language can't responsibly stand in without real visibility logic. Returns in a follow-up plan with state behind it.

---

## 3. Target shape

```
/                           ── WorldStage (placeholder 3D scene)
                               + Studio pill (top-right, dead — visible placeholder badge)
                               + Voice button (bottom-center, mic icon — the primary action)
                               + Library button (bottom-right — navigates to /library
                                                  for the full V/I/P/S overview in one place)
                               + bottom-sheet handles:
                                     Values · Interests · Personality · Skills · Trajectory
                                     (quick drill-in to one dimension at a time)

                               Voice mode (in place — no navigate):
                                 tap Voice → mic permission → recording
                                   (world stage stays visible as the ambient surface;
                                    optional emotion chip floats bottom-corner)
                                 tap Stop → transcribe → Mirror → persist
                                   (Mirror emits validation /
                                    inferred_meaning / story_reframe /
                                    inferred_emotion)
                                 → navigate to /reflect/review

/reflect                    ── DEPRECATED this plan. The route file is
                               removed; the layout route `/reflect`
                               (`reflect.tsx`) is also removed since
                               `/reflect/review` is now a top-level route.

/reflect/review             ── unchanged path (now top-level route file
                               `reflect-review.tsx` or kept as
                               `reflect.review.tsx` under a no-op
                               layout — implementer's choice).
                               PostMirrorReview now also renders
                               inferred_emotion as a chip + (optional)
                               user-tagged emotion chip with a
                               same/aligned/different connector.

/library                    ── EXISTING LibraryIndexPage (unchanged) —
                               the central all-V/I/P/S view: 4 dimension
                               cards in one place, "Run sense-making"
                               CTA, and counsellor-brief export. This
                               is the central entry point linked from
                               the new Library button on `/`.
/library/$dimension         ── EXISTING VipsPageView (unchanged) — same
                               component the bottom sheets render
/library/trajectory         ── existing route (unchanged)
```

Sheets vs routes: `/library/$dimension` and `/library/trajectory` remain reachable by deep-link. The world view's sheet-open simply navigates to those routes inside a sheet container — same data, two presentation modes.

### 3a. Visual source of truth

The user-shared screenshots — `~/Downloads/image (2).png` (Skills sheet), `~/Downloads/image (3).png` (Personality sheet), `~/Downloads/image (4).png` (emotion picker), `~/Downloads/image (5).png` (world view) — are the **intent reference** for this plan. When implementer judgment is ambiguous, defer to the screenshots over the prose. The plan does not commit to pixel-exact match (polish plan handles that), but visual language (low-poly scene with bird in tree, muted off-white sheet backgrounds, 3x3 emotion grid with custom shape primitives, pull-up sheet from bottom 60–70% of viewport) is anchored to those frames.

The Skills and Personality sheet screenshots show a different layout (eyebrow / title / buckets) than the current `VipsPageView` ships. This plan **keeps the current layout** at user direction — the sheet contents the implementer ships will not match those two screenshots; that restructure is deferred entirely. Use the screenshots for the world view (image 5), the emotion picker (image 4), and the sheet *envelope* (the pull-up panel + close X + grabber), not for the sheet *contents*.

### 3b. Screen-level visual hierarchy

What the user sees first / second / third on each surface — primary anchor, primary action, secondary affordances.

| Surface | 1st (primary anchor) | 2nd (primary action) | 3rd (secondary) | What's intentionally muted |
|---|---|---|---|---|
| `/` (idle) | WorldStage placeholder fills upper ~65% — the user lands in an ambient scene rather than a form | Voice button (mic icon, bottom-center) — the only live capture action | Library button (bottom-right) → `/library` for the full V/I/P/S overview; SheetEntryRail below the stage for per-dimension quick drill-in | Studio pill (placeholder badge), no nav chrome |
| `/` (voice mode, recording) | World stage stays exactly as it was on idle — the scene is the ambient surface while the user talks. A subtle volume-reactive halo near the Voice/Stop button gives audible feedback without animating the scene itself | Stop button (replaces Voice button in the same bottom-center slot) | Optional emotion chip floats bottom-right corner; soft prompt overlay if silent 3s | Timer ("listening · Ns remaining") sits quietly in `text-muted-foreground` near the Stop button; sheet rail can stay or fade |
| `/` (post-Stop, working) | World stage still visible behind a thin overlay panel; one muted phase line on the overlay ("transcribing…" → "Mirror is reflecting back…" → "saving to your library…") | (none — system working) | (none) | No camera frame ever appeared; no skeletons; no spinners; just a quiet line of text over the scene |
| Sheet open (any V/I/P/S) | Existing `VipsPageView` — dimension label header, `compiled_truth` paragraph (per-dimension voice calibration), open question line, chronological Timeline list | Tap a timeline entry → "see source reflection →" link to `/library/$entryId` | Per-entry forget button (inline confirm), strength badge, parallax chips | Layout is unchanged from `/library/$dimension`; sheet is just a different presentation mode |
| Sheet open (trajectory) | Trajectory compiled paragraph — single-paragraph lead-sheet | "see full trajectory →" link to `/library/trajectory` | (none) | Full pathway cards stay on the dedicated route — sheet is a launchpad, not a container |

### 3c. User journey & emotional arc

The original product framing (Quiet Mirror Pivot, per README.md) was a deliberate rejection of conversational/realtime UX in favor of silent reflection. This plan reshapes the ritual but **must preserve the emotional arc the Quiet Mirror established**: arrival-in-stillness → intentional-self-disclosure → reflection-without-interruption → review-as-confirmation. The structural changes here serve that arc — they should not contradict it.

| Step | What the user does | What they should feel | What this plan specifies to support that feeling |
|---|---|---|---|
| Arrival | Lands on `/` | "I'm somewhere quiet" — not "What do I do?" | World stage as full-bleed ambient surface; only one live action (Voice button); no top-nav chrome on `/` |
| Intent | Taps Voice button | "I've chosen to do this" — explicit, not auto-pulled | New `idle` phase replaces v0.1's auto-acquire-on-mount; the user names the moment by tapping; mic permission is requested only after the tap |
| Recording | Talks aloud ~60–90s, world scene visible in front of them | "Nobody is here except me" — no AI voice, no interruption, no self-image staring back | Audio-only capture; no camera, no flipped video, no aspect-square mirror frame; the world scene stays as the ambient surface while the user speaks |
| Optional self-tag (during) | (Optional) Taps the emotion chip while recording, picks a tile | "I can name this if I want, but I don't have to" | In-session emotion chip is non-blocking, lives in the recording-view corner; tapping opens a compact picker overlay that doesn't pause the recorder |
| After Stop | Waits ~1–3s while system works | "It's working. Quietly." | A single muted phase line — transcribing → reflecting → persisting → done — no skeletons, no spinners, no chatter; world scene still visible behind a thin overlay |
| Reflection | Mirror surfaces validation / inferred_meaning / story_reframe + **inferred_emotion** | "Something heard me, then gave it back — including what it sensed I felt" | PostMirrorReview adds a 4th block rendering the inferred emotion as a chip (shape + label). If the user *also* tagged during the session, both render side-by-side so the user can see where their self-read and the system's read aligned or diverged |
| Confirmation | Reviews staged diff, confirms or forgets | "I'm the one editing my own page" | Existing PostMirrorReview unchanged; the new inferred-emotion block is read-only context, never gated on confirm |

**Open tension (also captured in §9 deferred):** removing the camera retires the "webcam-as-mirror" visual metaphor that v0.1's Quiet Mirror Pivot was named for. Mirror as an *agent name* is preserved (Mirror still emits validation / inferred_meaning / story_reframe / inferred_emotion), but the literal mirror visual is gone. This is a deliberate identity move — the world scene replaces the self-image as the ambient surface — and the README's "Quiet Mirror Pivot" framing will need a corresponding update in a follow-up plan.

---

## 4. Implementation units

### U1. WorldStage placeholder component

**Goal:** Introduce the world-stage shell so every downstream surface has a stable mount point. The placeholder ships as a static visual; the real threejs scene replaces this internal in a later plan without changing the component's external API.

**Dependencies:** none.

**Files:**
- `src/components/WorldStage.tsx` (new)
- `test/components/WorldStage.test.tsx` (new — repo test convention lives under `test/`, not co-located)

**Approach:**
- Single component with no external state. Renders:
  - Sky gradient background (Tailwind, top-half of viewport).
  - Centered low-fidelity SVG silhouette (island circle + abstract tree shape) — clearly placeholder, not styled to mimic the real scene.
  - Optional `children` slot rendered above the stage for HUD content (Studio pill placeholder, Capture CTA — supplied by parent in U3).
- Expose a single ref via `forwardRef` for future threejs canvas mounting — empty in this plan but documented.
- Use `data-testid="world-stage"` and `data-placeholder="true"` so the next plan's swap is observable from tests.
- No animation, no responsiveness beyond `aspect-video`/`min-h` constraints — polish later.

**Patterns to follow:** existing primitive components in `src/components/ui/`. No state management.

**Test scenarios:**
- Renders the placeholder root with `data-testid="world-stage"`.
- Renders a `children` slot passed in by parents.
- Renders the `data-placeholder="true"` attribute so other layers and tests can target placeholder mode unambiguously.

**Verification:** component imports cleanly, lints, types check, and tests pass.

---

### U2. BottomSheet primitive

**Goal:** A minimal drawer primitive that can host VIPS-dimension content or the Trajectory page on top of the world view. No gestures, no physics — visibility is driven by a controlled `open` prop.

**Dependencies:** none.

**Files:**
- `src/components/BottomSheet.tsx` (new)
- `test/components/BottomSheet.test.tsx` (new)

**Approach:**
- Controlled component: `{ open: boolean; onOpenChange: (open: boolean) => void; children }`.
- Renders a fixed-position panel anchored to the bottom of the viewport, occupying the lower ~60–70% when open, fully off-screen when closed.
- Visible "grabber" line at top (decorative this plan — no drag handler).
- Close X button top-right inside the sheet, calling `onOpenChange(false)`.
- Backdrop click → close (simple `onClick` on a transparent overlay; no animation).
- Focus management: when `open` flips true, move focus to the close button.
- `data-testid="bottom-sheet"`, `data-state={open ? 'open' : 'closed'}`.
- **Minimal slide-up transition**: a single CSS `transform: translateY(...)` paired with `transition: transform 200ms ease-out` on the panel. Closed = `translateY(100%)`; open = `translateY(0)`. Backdrop fades opacity 0 ↔ 1 in the same 200ms. This is the cheapest possible motion that prevents snap-blink on tap and keeps the panel safe to wrap in a richer `Transition` / `Dialog` later without changing the consumer API. No springs, no gesture-driven drag, no scroll-snap — those are the deferred pieces.

**Patterns to follow:** `src/components/ConfirmDialog.tsx` for controlled-open + close-button + focus shape. Do not import a third-party drawer library — Tailwind + plain React is enough at this stage.

**Test scenarios:**
- Returns `null` (or rendered-but-hidden, depending on implementation) when `open=false`; renders content when `open=true`.
- Clicking the close X invokes `onOpenChange(false)` exactly once.
- Clicking the backdrop invokes `onOpenChange(false)` exactly once.
- Pressing Escape invokes `onOpenChange(false)`.
- Focus lands on the close button when `open` transitions to true.
- The panel's `transform` style flips between `translateY(100%)` and `translateY(0)` on `open` change; the `transition: transform 200ms ease-out` declaration is present on the panel element.

**Verification:** unit tests cover the four close paths, the focus rule, and the transform-style flip.

---

### U3. Replace `/` landing with WorldStage + Voice button + sheets

**Goal:** Rewire the landing route to render the world stage + a Voice button (primary action) + bottom-sheet entries for the 4 VIPS dimensions and Trajectory. Replaces the current text + two buttons (`Start a reflection` / `Open library`). Voice mode itself (the recorder state machine) lives in U5 and mounts in place on `/` — there is no navigate during recording.

**Dependencies:** U1, U2. (U3 renders `VipsPageView` unchanged — U4 is a no-op.)

**Files:**
- `src/routes/index.tsx` (modify — full rewrite of `LandingPage` + **add a `loader` that calls `loadPendingReview` and throws `redirect({ to: '/reflect/review' })` on pending diffs**; `/` has no loader today, so this is a net-new addition matching the `/library` / `/library/$dimension` / `/library/trajectory` pattern)
- `src/components/WorldHud.tsx` (new — Studio pill + Voice button + Library button. No chat input bar this plan; no "Only you" indicator — see below)
- `src/components/SheetEntryRail.tsx` (new — row of dimension/trajectory sheet-open triggers; aria-expanded + aria-controls per trigger)
- `src/components/TrajectorySheetView.tsx` (new — slim trajectory sheet content: compiled paragraph + "see full trajectory →" link to `/library/trajectory`; reuses the existing trajectory loader)
- `test/components/WorldHud.test.tsx` (new)
- `test/components/SheetEntryRail.test.tsx` (new)
- `test/components/TrajectorySheetView.test.tsx` (new)
- `test/routes/index.test.tsx` (new or update)

**Approach:**
- `LandingPage` becomes:
  - `<WorldStage>` (U1) is the full-bleed ambient surface.
  - `<WorldHud>` overlays the stage — Studio pill top-right, Voice button (from U5) bottom-center.
  - `<SheetEntryRail>` sits below the stage (or layered on it) with five entries: Values, Interests, Personality, Skills, Trajectory.
  - Local state tracks which sheet is open (`null | VipsDimension | 'trajectory'`).
  - Sheet content renders via `<BottomSheet open=...>` (U2) that imports the existing `VipsPageView` for V/I/P/S, and `<TrajectorySheetView>` for trajectory. **No reskin** — U4 is a no-op, so `VipsPageView` shows its current dimension-label / compiled_truth / timeline shape unchanged.
- **`/` loader (new)**: pre-fetch `loadPendingReview`; if `pending.diff` is truthy, throw `redirect({ to: '/reflect/review' })`. Otherwise pre-fetch `loadVipsPages` so sheet content is ready when a sheet opens. Mirrors the existing R30 pattern in `src/routes/library.index.tsx`.
- **Voice button**: the primary capture action. Renders as a circular mic icon in `WorldHud` (bottom-center). Tapping it transitions the `MirrorSession` state machine (U5) into voice mode in place — no navigate, no separate route. The button's appearance and behavior change with voice-mode phase (see U5).
- **Library button**: the central entry point for viewing all V/I/P/S in one place. Renders as a small icon-and-label button (book / grid icon + "Library" text, or icon-only with `aria-label="Library"`) in `WorldHud` bottom-right. Tapping it navigates to `/library` — the **existing** `LibraryIndexPage` (4-card grid for Values / Interests / Personality / Skills + "Run sense-making" CTA + counsellor-brief export). No new overview component is built; `/library` is the central view and this button is the new entry point from `/`.
- **Two complementary VIPS affordances on `/`**: the SheetEntryRail (5 entries) gives quick single-dimension drill-in via a bottom sheet without leaving the world view; the Library button gives the full grid view by navigating to `/library`. They are not redundant — sheets serve "quick peek at one thing", the Library page serves "see everything at once + run sense-making + export."
- **No chat input bar.** Earlier draft of this plan included a disabled "Say something to the bird" placeholder; dropped at user direction. Voice is the only input affordance this plan.
- **Studio pill**: dumb static text rendered with a `data-placeholder="true"` attribute styled with a faint dashed underline so QA / reviewers can see at a glance it's not real UI. `data-testid="studio-pill"` for future wiring.
- **"Only you" indicator dropped this plan.** Privacy-implying language can't responsibly stand in without real visibility logic.
- Preserve a path to `/library` direct routes for deep-linking: the SheetEntryRail entry for, say, Values, opens the bottom sheet AND uses the pre-fetched `loadVipsPages` query so the sheet has data immediately.
- **Sheet content states** (against the existing `VipsPageView`):
  - **Loading**: when `loadVipsPages` is still pending (rare after pre-fetch but possible on slow networks / cache miss), the open sheet renders a generic 3-line muted skeleton (no bucket-specific structure since the layout isn't being reskinned).
  - **Error**: when `loadVipsPages` errors, the open sheet renders a single-line muted message "Couldn't load this page — try closing and reopening." No retry button this plan.
  - **Empty**: existing `VipsPageView` already handles the no-`compiled_truth` / no-timeline case with its own muted copy — sheet inherits that behavior unchanged.
- **A11y on SheetEntryRail**: each trigger button carries `aria-expanded` (true when its sheet is open) and `aria-controls` pointing at the BottomSheet's `id`. Tab order on `/`: rail triggers → Voice button → Library button → Studio pill. No arrow-key cycle on the rail (5 items, tab is fine).
- **Voice mode + sheets + Library button**: when voice mode is active (recording or post-Stop processing), the SheetEntryRail, individual sheet-open affordances, AND the Library button are all disabled — the user can't open a VIPS sheet or navigate away from the world mid-recording. Already-open sheets close on voice-start. Implementation: the sheet-open state flips to `null` when `MirrorSession` enters `recording` phase; the Library button reads the same phase and renders `aria-disabled` / intercepts the click.

**Patterns to follow:**
- `src/routes/library.index.tsx` for the loader shape (`loadPendingReview` pre-fetch + redirect, `loadVipsPages` pre-fetch) and for `useQuery({ queryKey: ['vips-pages', STUDENT_ID] })` to source sheet content.
- `src/components/ui/button.tsx` and existing icon patterns for the Voice button (use the existing `lucide-react` `Mic` icon).

**Test scenarios:**
- Landing renders the `world-stage` testid, the `studio-pill` testid (with `data-placeholder="true"`), the `voice-button` testid, and the `library-button` testid. The "Only you" element is NOT rendered (assert absent). There is no chat input element rendered (assert absent).
- The Voice button is enabled on idle; clicking it transitions `MirrorSession` into the voice-mode flow (assert by intercepting the state-machine transition, not by checking permission prompts).
- The Library button is an anchor / `<Link to="/library">` (assert `href` resolves to `/library`).
- The Library button is disabled / not interactive while voice mode is active (same rule as the sheet rail — no leaving the world mid-recording). Use `aria-disabled="true"` + intercepted-click guard.
- Clicking each of the 5 SheetEntryRail entries opens the BottomSheet with the right `data-testid` (`vips-card-values`, etc.). Sheet content is the existing `VipsPageView` (assert that the dimension label header + compiled_truth paragraph + Timeline h2 are present; do NOT assert eyebrow/bucket structure — that layout is not built this plan).
- Each rail trigger reports `aria-expanded="true"` only when its sheet is open and `aria-controls` resolves to the live BottomSheet id.
- Closing a sheet (X / backdrop / Esc) returns the surface to "no sheet open" and the trigger's `aria-expanded` flips back to `false`.
- The new `/` loader redirects to `/reflect/review` when `loadPendingReview` returns a pending diff (mock the query).
- The new `/` loader does NOT redirect when `loadPendingReview` returns `{diff: null}`; `LandingPage` mounts.
- Sheet rail is disabled while voice mode is active: when `MirrorSession` enters `recording` phase, the rail triggers are not interactive (assert `aria-disabled="true"` or `disabled`); when voice mode exits, the rail re-enables.
- Sheet content error-state: when `loadVipsPages` rejects, the open sheet renders the muted error line.
- Trajectory sheet renders the compiled paragraph + "see full trajectory →" link to `/library/trajectory`.

**Verification:** the new `/` loader correctly bounces pending diffs; sheets render `VipsPageView` unchanged; existing `/library` direct routes still respond unchanged; voice mode and sheet interaction are mutually exclusive.

---

### U4. VIPS dimension pages — no changes this plan

**Goal:** Keep the existing `VipsPageView` render exactly as it is today. The sheets (U3) render `VipsPageView` directly with no reskin; the route at `/library/$dimension` is unchanged.

The earlier draft of this plan proposed an eyebrow / title / subtitle / `top` / `stable` / `newest` bucket restructure (matching the screenshots' Skills and Personality sheet headers). That restructure is **dropped from this plan** at user direction — keep the current VIPS UI model. Bucketing logic, per-dimension labels, lookup tables, eyebrow/subtitle copy, and the `vips-buckets.ts` library file are not built this plan.

If a future plan revisits the dimension-page layout, it can introduce buckets then — the data model (`VipsTimelineEntryRow` with `strength`, `parallax_tag`, `created_at`, `reflection_id`) already supports a bucketing layer without schema work.

**Dependencies:** none.

**Files:** none modified this plan.

**Approach:** none. `src/components/VipsPageView.tsx` is unchanged — header with dimension label, `compiled_truth` paragraph using the per-dimension `DIMENSION_COMPILED_TRUTH_CLASS` voice calibration, optional open-question line, "Timeline" h2, chronological list of entries with strength badges + parallax chips + per-entry forget action. Same exact shape the v0.2 wiki pivot shipped.

**Patterns to follow:** n/a.

**Test scenarios:** none added. Existing `test/components/VipsPageView.test.tsx` is unchanged.

**Verification:** the route `/library/$dimension` renders identically to its current main-branch behavior; the sheet variant in U3 wraps the same component in a `BottomSheet` and therefore inherits the same layout.

---

### U5. Voice mode on `/` — audio-only, in place, no camera

**Goal:** Reshape the Mirror session from a separate `/reflect` page with auto-camera-on-mount into in-place voice mode on `/`. **No camera**, no video element, no flipped mirror frame — audio capture only. The world stage stays visible while the user talks. On Stop, the chain runs straight through transcribe → Mirror → persist → navigate to `/reflect/review`.

**Dependencies:** U6 (the optional in-session chip uses `EmotionPicker` as an overlay, and the schema needs `mood` + `inferred_emotion`).

**Files:**
- `src/components/MirrorSession.tsx` (modify — significant simplification: drop video, drop `<video>` element, drop volume-ring overlay on video, drop the flipped self-view; replace with audio-only capture + volume affordance attached to the Voice/Stop button)
- `test/components/MirrorSession.test.tsx` (**new** — no MirrorSession test exists in the repo today. Mocks needed: `getUserMedia` (audio-only), `MediaRecorder`, `AudioContext`, and the three server fns. Materially more work than "update assertions" — budget accordingly.)
- `src/components/VoiceButton.tsx` (new — the bottom-center primary affordance. Three visual states: `idle` (mic icon, "Voice" label or icon-only), `recording` (stop icon, with a volume-reactive halo), `working` (small disabled spinner shape while the post-Stop chain runs))
- `test/components/VoiceButton.test.tsx` (new)
- `src/routes/reflect.tsx` (**deleted** — the layout route is no longer needed since `/reflect/review` becomes a top-level route)
- `src/routes/reflect.index.tsx` (**deleted** — the `/reflect` page is no longer reachable; voice mode runs on `/` in place)
- `src/routes/reflect.review.tsx` (rename or restructure to be a top-level route; TanStack file-based routing accepts either `reflect-review.tsx` at the top level or keeping it under a no-op `reflect.tsx` layout that just renders `<Outlet />`. Implementer picks whichever is cleaner — both compile to the same URL)
- `src/routes/__root.tsx` (light edit — the existing `reflect` nav link in the header gets removed, since the route no longer exists; the `review` link can stay since `/reflect/review` is still reachable)

**Approach:**
- **Audio-only `getUserMedia`.** Replace the current `navigator.mediaDevices.getUserMedia({ audio: true, video: {...} })` with `getUserMedia({ audio: true })`. No `videoRef`, no `videoRef.current.srcObject`, no flipped `transform: scaleX(-1)`, no `aspect-square` mirror frame.
- **Voice-mode state machine.** Reducer phases: `idle` → `requesting-mic` → `recording` → `transcribing` → `reflecting` → `persisting` → `done`. Same shape as the prior plan iteration but renamed for clarity (`idle-awaiting-capture` → `idle`; `permission-pending` → `requesting-mic`).
- **Voice button → Stop button transition.** The same bottom-center button in `WorldHud` (from U3) is rendered by `<VoiceButton>` and reads its visual from `MirrorSession`'s phase. On `idle`: mic icon, tap to start. On `recording`: stop icon (or square symbol), tap to end. On `working` (transcribing / reflecting / persisting): disabled state, no tap target. The button has a volume-reactive halo (CSS scale + opacity driven by the analyser's RMS reading) during `recording` — this replaces the v0.1 ring-around-the-video. The halo IS the recording feedback now, since there's no video to wrap.
- **World stage stays visible** throughout idle → recording → post-Stop processing. The world scene is the ambient surface, not a recording chrome. The Voice/Stop button floats on top of it, bottom-center.
- **Post-Stop overlay.** During `transcribing` / `reflecting` / `persisting`, render a thin centered overlay panel (max-width small, semi-transparent background ~0.6 over the world) with one muted phase line at a time:
  - `transcribing`: "transcribing what you said…"
  - `reflecting`: "Mirror is reflecting back…" (with the in-session-picked emotion chip, if any, still visible inside the overlay so the user can see their self-tag persist across the wait)
  - `persisting`: "saving to your library…"
  - `done`: "done. Opening your reflection." (navigate to `/reflect/review` within 200ms)
- **Optional in-session emotion chip.** During `phase === 'recording'`, render the chip floating bottom-right of the world view (above the SheetEntryRail, near the Voice/Stop button). Tapping opens `<EmotionPicker layout="overlay">` (from U6 + §10b). Selecting a tile fires `{ type: 'mood-tagged'; mood }`. Recording does not pause. Chip label updates to the picked value. Tapping again lets the user change their mind. Only the last pick is held in `state.mood`. If never tapped, `state.mood` stays `null`.
- **Voice button idempotency.** The click handler is idempotent — pressing it while `phase !== 'idle'` is a no-op for the "start voice mode" action; pressing while `phase !== 'recording'` is a no-op for the "stop" action. The button's `disabled` attribute already enforces this in the UI; the handler guard is the defensive duplication.
- **`handleStop` guard.** Restricted to `phase === 'recording'` only. No "Stop and reflect" button this plan; the button is just labeled "Stop" or shown as a stop-icon, since there's no longer a post-Stop user gate to "reflect" into.
- **Dev `?inject=` seam.** Detect pre-render in `useReducer`'s initializer (not in a mount-time `useEffect`). When `?inject=<transcript>` is present in `window.location.search`, the initial state lands directly on `phase: 'transcribing', pendingTranscript: <injected>`. From there, a small effect fires `runMirror` and continues through the existing chain. The seam stays useful for headless tests and humans without a working mic.
- **`MediaRecorder` audio-only.** The existing audio-only path in `MirrorSession.tsx` (`new MediaStream(stream.getAudioTracks())`) becomes the only path — since the source stream is already audio-only, the `MediaStream` clone step can be simplified to `stream` directly. `pickMimeType()` stays unchanged.
- **`friendlyMediaError`** simplifies — only `NotAllowedError` / `NotFoundError` / `NotReadableError` / `SecurityError` for the microphone need to be friendly. The "camera in use by another app" branch goes away. Update copy to say "microphone" not "camera + microphone".

**Reducer additions:**
- New action: `{ type: 'mood-tagged'; mood: Mood }` — updates `state.mood`. Allowed in `recording` phase only (defensive guard); ignored elsewhere.
- New state field: `mood: Mood | null` — defaults to `null`; reset to `null` on `reset`.
- `state.mood` is forwarded to `persistMirror({ data: { ..., mood: state.mood } })` whenever Mirror returns successfully.

**Patterns to follow:** existing reducer + `useReducer` from `MirrorSession.tsx`. Existing `AudioContext` + `analyser` + RMS smoothing pattern for the volume-reactive halo on the Voice button. The in-session chip + popover is the same `EmotionPicker` component from U6.

**Test scenarios:**
- Mount renders the world view + Voice button in `idle` state; `getUserMedia` is NOT called on mount.
- Tapping the Voice button calls `getUserMedia({ audio: true })` (assert mock — the call MUST NOT include `video`).
- After permission grant, phase is `recording`; the Voice button now renders as the Stop icon.
- During `recording`, no `<video>` element is rendered anywhere on the page.
- During `recording`, the volume halo around the Voice/Stop button scales with mock RMS readings from the analyser.
- During `recording`, the emotion chip is rendered with label `"Tag emotion"` initially.
- Tapping the chip during recording opens `EmotionPicker` overlay; selecting a tile fires `mood-tagged`; chip label updates; recording does not pause (Mirror is still recording, no `MediaRecorder.stop()` call).
- Tapping Stop transitions to `transcribing` and stops the recorder.
- Linear chain: Stop → transcribing → reflecting → persisting → done → navigate to `/reflect/review`. `onPersisted` callback fires with the existing `MirrorSessionResult` shape.
- `state.mood` is forwarded to `persistMirror`: when the user tagged during the session, the call carries `mood: '<value>'`; when they didn't, `mood: null` (or field omitted).
- The dev `?inject=` seam still works: setting it makes the initial state land directly on `transcribing` with the injected transcript — `idle` is never entered. From there the chain runs through reflecting → persisting → done.
- Without `?inject=`, fresh mount lands on `idle` and stays there until Voice is tapped.
- `handleStop` is a no-op outside `phase === 'recording'`.
- Error states from `transcribeMirror` / `runMirror` render the warning card over the world (not full-screen); the in-session-tagged `mood` is preserved across error retries (`reset` action clears it).
- The deleted `/reflect` route returns 404 on direct navigation.
- The `/reflect/review` route remains reachable and unchanged.

**Verification:** `pnpm check` + `pnpm test` + `pnpm build` pass; no camera permission prompt fires anywhere in the demo flow; the `/` route handles the entire idle → record → review handoff in place; `/reflect/review` continues to render the post-Mirror review surface correctly.

---

### U6. EmotionPicker + Mirror `inferred_emotion` + review render

**Goal:** Three coordinated additions that together replace the blocking 9-emotion picker with a quieter, inference-led approach:
1. A reusable `EmotionPicker` component (used by U5 as an in-session overlay; tile entrance storyboard in §10b).
2. **Mirror agent extension** — Mirror now emits a 4th output field, `inferred_emotion` (closed enum), alongside `validation` / `inferred_meaning` / `story_reframe`.
3. **Schema additions** — two new columns on `mirror_entries`: `mood` (user-picked, nullable) and `inferred_emotion` (Mirror's read, always non-null when the agent succeeded).
4. **PostMirrorReview surface** renders both — Mirror's `inferred_emotion` always; the user's `mood` alongside it when present — so the user can see where their self-read and the system's read aligned or diverged.

**Dependencies:** none — but U5 depends on this for the in-session chip overlay.

**Files:**
- `src/components/EmotionPicker.tsx` (new — modeled on `ContextTypePicker.tsx` structure; supports both standalone and overlay layouts)
- `test/components/EmotionPicker.test.tsx` (new)
- `src/components/EmotionChip.tsx` (new — small read-only chip used in two places: (a) the in-session affordance during recording in U5, (b) the PostMirrorReview read-out of `inferred_emotion` and optional user `mood`)
- `test/components/EmotionChip.test.tsx` (new)
- `src/agents/mirror.ts` (modify — extend Mirror's output schema with `inferred_emotion: MoodSchema`; update the system prompt with one paragraph instructing Mirror to infer emotion from the transcript, picking the closest of the 9 placeholder labels, with a "if you cannot tell, pick the closest neighbor" fallback so the field is always populated)
- `src/agents/tools/schemas.ts` (modify — add `MoodSchema` enum; extend `MirrorAgentOutputSchema` with `inferred_emotion: MoodSchema`; do **not** touch `VipsContextTypeSchema`)
- `src/db/queries.ts` (modify — extend `MirrorEntryInput` and `MirrorEntryRow` with `mood?: Mood | null` and `inferred_emotion: Mood`; extend insert + select statements)
- `src/db/schema.sql` (modify — add `mood` AND `inferred_emotion` columns to `mirror_entries`, each with the same CHECK enum)
- `src/db/client.ts` (modify — bump `SCHEMA_VERSION` from `'4'` to `'5'`; update the `_meta` insert in `schema.sql` to match)
- `src/db/seed.ts` (modify — seed sets `inferred_emotion` to a plausible default per entry; leaves `mood` null since seeded entries pre-date the user-tag feature)
- `src/server/persist-mirror.functions.ts` (modify — accept optional `mood` and required `inferred_emotion` in the input; forward both to the queries layer)
- `src/server/run-mirror.functions.ts` (modify — wire the Mirror output's `inferred_emotion` through to the persist call site in U5's `MirrorSession`)
- `test/server/persist-mirror-v0.2.test.ts` (modify — assert both fields round-trip)
- `src/components/PostMirrorReview.tsx` (modify — add a new "what Mirror sensed" block rendering the `inferred_emotion` chip; when the entry's `mood` is also set, render a second smaller "what you said you felt" chip next to it with a one-line connector — same / aligned / different)
- `test/components/PostMirrorReview.test.tsx` (modify or create — assert the new block renders correctly in all three cases: inferred only, both with same value, both with different values)
- `test/agents/mirror.test.ts` (modify — assert Mirror returns a valid `inferred_emotion` from the closed enum on every test fixture)

**Approach:**
- **`MoodSchema`**: `z.enum(['joy', 'sadness', 'anger', 'fear', 'disgust', 'anxiety', 'envy', 'embarrassed', 'ennui'])`. Placeholder labels matching the screenshot — final taxonomy is a separate plan. Both `mood` and `inferred_emotion` use this same enum so they're directly comparable.
- **`EmotionPicker`** renders a 3x3 grid, each tile a `Button` with a colored shape placeholder and text label. Shape↔emotion pairing per §10b's `TILES.items`. Two layout modes:
  - `layout="standalone"` (default — used nowhere this plan but available for future surfaces; renders centered, full-width grid)
  - `layout="overlay"` — compact mode for U5's in-session chip popover; renders in a small floating card anchored to the chip, with backdrop click closing it
- **Accessibility:** unchanged from prior spec — `role="radiogroup"`, `aria-label="Who's at the console?"`, `role="radio"` + `aria-checked` on tiles, roving tabindex, arrow-key + Home/End navigation, `aria-hidden` on shape SVGs.
- **`EmotionChip`**: a read-only display component (not a button by default; supports `onClick` for the in-session affordance use case). Renders the shape primitive + label inside a small pill. Two variants:
  - `variant="inferred"` — muted background, "Mirror sensed: " prefix in a tiny eyebrow
  - `variant="user"` — accent background, "You felt: " prefix
  - When both render in PostMirrorReview side-by-side, they share a one-line connector that reads `same`, `aligned (within neighbor groups)`, or `different` based on a simple equality + neighbor-group lookup defined alongside the component.
- **Mirror agent prompt extension.** One paragraph appended to the existing system prompt — keep it short, in the existing voice of the prompt: "You also return an `inferred_emotion` from this closed list: `joy / sadness / anger / fear / disgust / anxiety / envy / embarrassed / ennui`. Pick the single closest match for the dominant emotional tone of the transcript. If the transcript is too short or neutral to tell, pick the closest neighbor rather than refusing — this field is always required."
- **Schema** (version-gated drop-and-recreate, as already specced for U5):
  - Add to `mirror_entries`:
    ```sql
    mood TEXT NULL CHECK (mood IN ('joy','sadness','anger','fear','disgust','anxiety','envy','embarrassed','ennui')),
    inferred_emotion TEXT NOT NULL DEFAULT 'joy' CHECK (inferred_emotion IN ('joy','sadness','anger','fear','disgust','anxiety','envy','embarrassed','ennui')),
    ```
    `inferred_emotion` is `NOT NULL` with a `DEFAULT 'joy'` so legacy / seeded rows have a valid value without forcing a migration backfill. The default doesn't reflect a real inference — it's just enum-conformant filler — and a follow-up plan can backfill seeded rows with real Mirror inferences if useful.
  - Bump `SCHEMA_VERSION` to `'5'` in `src/db/client.ts` and update the `_meta` literal in `schema.sql`.
  - This wipes existing local `mirror_entries` rows on next boot — every dev who pulls re-seeds.
- **`persistMirror`** server fn accepts an optional `mood` (defaults to NULL) and a required `inferred_emotion` (passed through from Mirror's output). The queries layer writes both.
- **`PostMirrorReview` render.** Above the existing dimension-group blocks, add a new "what Mirror sensed" section: chip rendering the `inferred_emotion`, plus the user's `mood` chip alongside when set, with the connector line. This is read-only context — it does NOT gate the existing confirm/forget actions.
- **Do not** wire either `mood` or `inferred_emotion` into the Connector input or VIPS parallax tagging in this plan. They're persisted and surfaced in review; downstream agent integration is a follow-up plan.

**Patterns to follow:** `src/components/ContextTypePicker.tsx` for `EmotionPicker`'s prop shape and localStorage last-used pattern (key: `sensemaking.mood.last_used`). The Mirror agent's existing output schema in `src/agents/tools/schemas.ts` for where to add `inferred_emotion`. The existing dimension-group block layout in `PostMirrorReview.tsx` for how the new section reads visually (eyebrow + content).

**Test scenarios:**
- `EmotionPicker`: renders 9 buttons, click fires `onSelect`, localStorage round-trips, radiogroup a11y + roving tabindex + arrow keys all work in both `standalone` and `overlay` layouts.
- `EmotionChip`: renders shape + label in both `variant="inferred"` and `variant="user"`; the connector line shows `same` when both values are equal, `different` when far apart, `aligned` for neighbor-group pairs (e.g., `sadness` ↔ `ennui`).
- `MoodSchema` parses every label and rejects unknown strings.
- Mirror agent fixtures: every fixture transcript produces a Mirror output where `inferred_emotion` is one of the 9 enum values (assert via Zod parse). Test at least 3 transcripts with clearly different emotional tones and confirm Mirror's pick is plausible (this is a soft assertion — log + visual inspection acceptable for v0.1).
- `persistMirror`: writes `mood` when provided, NULL otherwise; writes `inferred_emotion` always (rejects the call if `inferred_emotion` is omitted).
- `loadPendingReview` returns the new `inferred_emotion` and `mood` fields on the staged entry.
- `PostMirrorReview` renders the inferred chip on every entry; renders the user chip only when `mood` is non-null; renders the connector with the correct same/aligned/different verdict.
- Migration smoke: `pnpm seed` runs cleanly; new columns present in `app.db`; seeded rows have `inferred_emotion` populated.

**Verification:** `pnpm seed` runs cleanly; `pnpm test` passes; `/reflect/review` renders the new block on every reflection; the dev `?inject=` seam in U5 still produces a Mirror output with `inferred_emotion` populated.

---

### U7. Strip top nav on world view + remove `/reflect` link + smoke pass

**Goal:** Adjust the root layout: no top nav on `/` (world stage is the full surface); on other routes, keep the nav but **remove the `/reflect` link** since the route is deleted in U5.

**Dependencies:** U3, U5.

**Files:**
- `src/routes/__root.tsx` (modify — conditionally render the top header based on pathname; remove the `<Link to="/reflect">` entry from the nav).

**Approach:**
- In `RootComponent`, read the current pathname. If it equals `/`, render the layout without the `<header>` (or render a minimal transparent variant). Otherwise, render the existing header.
- **Remove the `/reflect` nav link.** The route no longer exists after U5. Keep the `/library` and `/reflect/review` links (both still reachable).
- Keep the `<Outlet />`, `<QueryClientProvider>`, and `<RootDocument>` shells intact.

**Patterns to follow:** TanStack `useRouterState` for pathname access; do not add a window-only check.

**Test scenarios:**
- Rendering the root with pathname `/` does not include the `nav` element.
- Rendering the root with pathname `/library/skills` includes the nav element with `library` and `review` links — but NOT a `reflect` link.
- Rendering the root with pathname `/reflect/review` includes the nav element (without the `reflect` link).
- Direct navigation to `/reflect` returns 404 (the route file is deleted in U5).
- Smoke: `pnpm check` + `pnpm test` + `pnpm build` all pass after the full set of changes.

**Verification:** the updated demo flow completes end-to-end (manual smoke). Specifically: from `/`, tap Voice → grant mic → speak → tap Stop → land on `/reflect/review`. From any VIPS sheet on `/`, open + close it; deep-linking to `/library/skills` still renders the full page. The optional in-session emotion chip works mid-recording without pausing the recorder.

---

## 5. Design system + viewport notes

### Design system status
No `DESIGN.md` exists in this repo. The plan inherits visual tokens from Tailwind defaults + the existing `src/components/ui/` primitives. This is a known gap surfaced by the design review and is acceptable for the structural goal of this plan, but should be addressed before polish:
- Recommend running `/design-consultation` (gstack) once `mood` taxonomy and emotion-vs-context resolution are settled (see §8) to author a `DESIGN.md` that codifies colors / type scale / motion / sheet/icon vocabulary.
- Until then: design decisions in this plan reference Tailwind classes and existing component patterns explicitly so an implementer can match the screenshot intent without inventing tokens.

### Viewport / responsive posture
Polish-phase work, deferred — but the plan must not paint itself into a corner. Minimum commitments this plan must honor so the polish plan has room to land:
- `WorldStage` uses `aspect-video` *or* `min-h-[60vh]` (implementer picks at execution time, not in this plan); does **not** use a fixed pixel height that breaks landscape vs portrait.
- `BottomSheet` width = 100% of viewport on mobile, capped at `max-w-3xl` (matches the root layout's existing cap) on desktop. Translates the same on both — no separate animation per breakpoint.
- `EmotionPicker` 3x3 grid uses `grid-cols-3` at all breakpoints (the screenshot uses the same 3x3 at large viewports — the rhythm is part of the design). Tile size flexes via `aspect-square` + `gap-3`.
- `SheetEntryRail` is a horizontal scroll-snap row on mobile (overflow allowed) and a flex row on desktop. Five entries × 1 row, never wrapping to 2 rows.
- Polish plan owns: gesture-driven sheet drag, scroll-snapping behavior, finer breakpoint tuning, landscape-vs-portrait mirror-frame sizing, and any motion beyond the simple slide-up transition specified in U2.

---

## 6. Scope boundaries

### Outside this plan
- The real threejs scene (placeholder only — separate plan).
- Sheet drag / spring physics / scroll-snapping / pull-to-refresh.
- Final emotion taxonomy — the 9 labels here are placeholders matching the screenshot.
- Wiring `mood` into Mirror / Connector / Cartographer prompts or VIPS parallax tagging.
- Studio pill workspace switcher (real state) and "Only you" visibility logic.
- Chat input bar's actual handler (it is intentionally disabled / placeholder this plan).
- Final typographic scale, color palette, motion design.
- Mobile gestures and responsive breakpoints below the existing `max-w-3xl` shell.

### Deferred to follow-up work
- A second plan to land the threejs scene against `WorldStage`'s extension seam.
- A "emotion ↔ VIPS parallax" plan that decides whether `mood` augments or replaces `context_type`, and migrates the agents accordingly.
- A copy/voice plan that finalizes eyebrow + subtitle strings per dimension and the bucket labels.

### Open questions (non-blocking)
- Whether the trajectory sheet should render the full `TrajectoryPageView` or a lighter "headline + open in full view" pattern — this plan defaults to the lighter pattern (compiled paragraph + "see full trajectory" link → `/library/trajectory`) to avoid sheet height blowing up.
- Whether `/reflect` should eventually be folded into the world view as an in-place capture, removing the navigate. This plan keeps the route to avoid coupling state-machine work with IA work.
- Image 3 shows pagination dots `● ○ ○` on the emotion picker, suggesting the post-Capture flow has **3 screens**, not 1. This plan only implements screen 1 (emotion picker). The other two screens are unknown from the screenshots; treat as inferred bet that they belong to a future plan (could be: secondary context tag, confirm prompt, or a "what changed?" reflection step). If the screen-2/screen-3 design surfaces later, slot them in between `picking-context` and `reflecting` in `MirrorSession`'s reducer — the state machine is already shaped for new intermediate steps.
- The world view shows `+` / `−` zoom controls (Image 4 + Image 3). These are 3D-scene-only controls and have no meaning while the scene is a placeholder. This plan does **not** render them; the threejs plan adds them alongside the real scene.

---

## 7. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bottom sheet without gestures feels broken on touch devices | medium | medium | Ship as drawer with backdrop-tap + X close. Note gesture work in the follow-up plan. Add a `data-placeholder-gestures="true"` attribute so QA can spot the gap. |
| `bucketTimeline` heuristic mislabels entries (e.g., `THE NEW ONE` reads as "stale" on weeks-old single-entry corpora) | low | low | Heuristic switched to relative-corpus buckets — `stable` is now "the durable middle beyond top/newest, capped at 3" rather than a hard 14-day cutoff. Empty sections are omitted entirely. Refine slot semantics when the per-dimension copy plan lands. |
| `mood` column landing without agent integration creates a "data we collect but ignore" smell | low | low | Document explicitly in the schema comment; cite this plan as the source. Follow-up plan picks up the wiring. |
| World view as `/` breaks anyone bookmarking `/library` as their home | low | medium | `/library` route remains; the SheetEntryRail is the new front door, not the only one. |
| Replacing auto-acquire-on-mount in `MirrorSession` regresses headless / dev tests | medium | medium | Preserve the `?inject=` dev seam and keep it short-circuiting through to `picking-context`. Update tests in U5. |
| Mood enum + ContextType enum co-existence confuses callers | low | low | New `MoodSchema` lives next to `VipsContextTypeSchema` in `schemas.ts`, with a short header comment explaining the additive intent. Both stay exported. |

---

## 8. Verification (end-to-end)

After all units land:
1. `pnpm check` + `pnpm test` + `pnpm build` all green.
2. `pnpm dev` boots; `/` renders WorldStage (placeholder visible), Studio pill (placeholder badge), Voice button (mic icon, bottom-center), Library button (bottom-right) linking to `/library`, 5 sheet rail entries. No chat input. No "Only you" indicator.
3. Clicking a dimension sheet opens it with real `loadVipsPages` data; **existing `VipsPageView`** renders inside (dimension label header + compiled_truth paragraph + Timeline list + per-entry forget action — unchanged from current main).
4. Tapping the Voice button requests microphone permission (NOT camera). On grant, voice mode enters in place — the world stage stays visible, the Voice button transforms to a Stop button with a volume-reactive halo. No `<video>` element ever appears.
5. (Optional) Tapping the in-session emotion chip during recording opens an overlay picker; selecting a tile updates the chip; recording does NOT pause.
6. Tapping Stop runs the chain — transcribing → reflecting → persisting — with a single muted phase line in a thin overlay over the world stage. No skeletons, no spinners.
7. On `done`, navigates to `/reflect/review`. PostMirrorReview renders with the new inferred-emotion chip; if the user also tagged during the session, both chips render with the same/aligned/different connector.
8. Deep-link to `/library/skills` still renders the full **unchanged** page (no eyebrow / no buckets — that restructure was dropped at user direction).
9. The dev `?inject=<transcript>` seam still works against `/` — initial state lands on `transcribing` and runs through the chain.
10. The R30 pending-review redirect on `/` works (with a `vips_proposed_diffs` row at `status='pending'`, hitting `/` redirects to `/reflect/review`).
11. Direct navigation to `/reflect` returns 404 (route deleted).
12. The Sheet rail AND the Library button are non-interactive while voice mode is active (assert visual + aria state on both); both re-enable once voice mode exits.
13. Tapping the Library button on `/` navigates to `/library`. `LibraryIndexPage` renders unchanged from current main — 4 dimension cards (Values / Interests / Personality / Skills) in one grid, "Run sense-making" button, "Export counsellor brief" link.


---

## 9. Deferred / Open Questions

### From 2026-05-12 review (round 1)

The following findings surfaced in the ce-doc-review pass and were deferred for user judgment rather than auto-applied. Each carries an evidence quote so round-2 review can suppress re-raises.

- **Premise stated, README needs to follow** *(product-lens, P1, anchor 75 → now committed)* — `README.md` frames this product as the Quiet Mirror Pivot ("the webcam is the mirror"). This plan **retires the camera** entirely and replaces the self-image-as-mirror with the world scene as the ambient surface. Mirror as an *agent name* is preserved (Mirror still emits validation / inferred_meaning / story_reframe / inferred_emotion), but the literal mirror visual is gone. This is now a committed identity move, not a deferred question — but `README.md`'s "Quiet Mirror Pivot" section, the camera-permission demo prep instruction, and the agent-flow description all need to be updated in a follow-up doc plan. Evidence (from the now-updated plan): "**Not** using the camera or webcam in any form. The `webcam-as-mirror` ritual from v0.1 (flipped self-image, square aspect ring, volume ring overlay on video) is **retired** by this plan. Audio capture only."
- **Emotion taxonomy vs VIPS-parallax compatibility** *(product-lens, P1, anchor 75)* — VIPS parallax tags reflections by *context* (school/family/peer/hobby/civic). Inside-Out emotions are a different axis: joy-at-school and joy-at-home are still joy. The plan ships `mood` as additive but defers the integration question. Risk: U6 lands a column and a UI surface whose load-bearing question (does mood feed parallax, replace context, or coexist orthogonally?) is unanswered, and the answer may invalidate both. Decide before U6 ships. Evidence: "MoodSchema = z.enum(['joy', 'sadness', 'anger', 'fear', 'disgust', 'anxiety', 'envy', 'embarrassed', 'ennui'])".
- ~~**Brand voice shift (Mirror/Connector/Cartographer → Studio/bird/console)**~~ — **Resolved by user direction.** Agent names stay (Mirror / Connector / Cartographer). The bird and other scene elements are not framed as listeners / companions / metaphors — they are just objects in the world scene. The "Studio" pill remains as a placeholder workspace switcher with no semantic weight beyond "this is dead UI until follow-up." No "console", no "bird-as-listener", no metaphor language in plan prose.
- **Sequencing: IA before real 3D scene** *(product-lens + adversarial, P2, anchor 75/50)* — IA decisions baked in here (sheet handles, chat input bar, bottom-30%-viewport sheet, Capture as CTA over the scene) assume the world stage is essentially a backdrop. If the real threejs scene introduces direct manipulation (drag to rotate island, tap-objects-on-the-stage as primary navigation, pan/zoom that needs the full viewport), chrome layout and sheet positions must be re-litigated. Consider inverting: ship the threejs scene against the *current* IA, then re-IA against the real scene. Evidence: "Not implementing the real threejs scene — `WorldStage` ships as a static placeholder".
- ~~**`mood` collected but ignored**~~ — **Resolved by simplification pass.** The user-tagged `mood` is now an *optional* input from the in-session chip, paired with a *required* `inferred_emotion` field that Mirror always emits and that PostMirrorReview renders. The column has a downstream consumer (the review surface) from day one. The follow-up "emotion vs VIPS-parallax" question (how mood/inferred_emotion feed Connector + Cartographer + parallax) remains open and is the right scope for a follow-up plan — but the "data we collect but never use" smell is gone.
- **Plan framed as structural but bundles 4 premise-level shifts** *(product-lens, P2, anchor 75)* — Behind the "reorder + layout" framing sit four product bets (one fewer after the simplification pass dropped the blocking emotion picker): world metaphor on `/`, new vocabulary (Studio/bird/console), new capture model (explicit vs auto-acquire), new inference field on Mirror. The blocking 9-emotion picker is no longer a separate bet — it's now an optional in-session affordance that defers to Mirror's inference. Remaining decision: split into a derisk-first plan (sheet IA + eyebrow/bucket reskin + explicit Capture) and a load-bearing-second plan (world stage as `/` + voice change + inference field), or accept the bundling. Evidence: "Goal of this plan is **structural** — get the flow and layout right with placeholders. Visual polish, real threejs scene, sheet physics, and the emotion taxonomy are explicitly deferred."
- ~~**Per-dimension bucket asymmetry implies different content shapes**~~ — **Resolved by user direction (VIPS reskin dropped).** The eyebrow / title / per-dimension-bucket restructure is not happening this plan (see U4 = no-op). `VipsPageView` keeps its current shape. The bucket-asymmetry question moves to a future copy/UI plan if/when the team revisits dimension page layout.


### From 2026-05-12 design review

- ~~**Sheet z-stack with SheetEntryRail when both visible**~~ — **Resolved in §10a** (storyboard pass): rail slides down to `translateY(100%)` on the same 200ms ease-out curve as the sheet's slide-up. Synchronized motion, one state change.
- **Studio pill placement when a sheet is open** *(design-lens, P2)* — The Studio pill sits top-right on the world view (`~/Downloads/image (5).png`). When a sheet is open (`~/Downloads/image (2).png`, `~/Downloads/image (3).png`), the screenshots show the pill **still visible** above the sheet. Confirm: does the pill stay anchored to the WorldStage region (covered behind the sheet's backdrop) or float on top of the sheet (visible in the screenshots)? If floating, what's its z-index relative to the sheet's close X button? Resolution affects U1 (WorldStage children API) and U2 (BottomSheet stacking).
- ~~**EmotionPicker tile shape semantics**~~ — **Resolved in §10b** (storyboard pass): shape↔emotion pairing committed in `TILES.items` (Joy→circle, Sadness→drop, Anger→diamond, Fear→cube, Disgust→ring, Anxiety→capsule, Envy→ellipse, Embarrassed→stepped-blocks, Ennui→disk). Polish plan swaps shapes for final illustrations without changing the data structure.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES_OPEN | score: 5/10 → 8/10, 9 decisions applied, 1 deferral remains (Studio pill stacking — static layout, not animation) |
| Animation Spec | `/interface-craft storyboard` | Coordinated motion + entrance scripts | 1 | CLEAR | §10a sheet/rail coordination + §10b in-session EmotionPicker overlay — resolves 2 of 3 design-deferred items |
| Simplification Pass | user-driven | Drop blocking emotion picker; add Mirror inference + optional in-session chip | 1 | CLEAR | U5 simplified (no `picking-context` phase); U6 extended (Mirror `inferred_emotion` + PostMirrorReview render); §10b reframed as overlay; resolves §9 `mood collected but ignored` |
| Scope Cut #2 | user-driven | Drop VIPS UI reskin, remove camera, voice-mode on `/`, no bird metaphor | 1 | CLEAR | U4 → no-op (existing `VipsPageView` unchanged); U5 → voice-only on `/`, no `<video>`, no flipped self-image, no `/reflect` route; U3 → Voice button replaces Capture link + chat input; U7 → drop `reflect` nav link. Resolves §9 brand-voice + per-dimension-bucket items. |
| Central VIPS entry | user-driven | Add a Library button on the world view → existing `/library` page | 1 | CLEAR | U3 → Library button in WorldHud (bottom-right) linking to `/library`; existing `LibraryIndexPage` (4-card grid + Run sense-making + counsellor brief) is the central all-VIPS view. Sheets on `/` remain for per-dimension quick drill-in. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |
| Doc Review | `ce-doc-review` | Cross-persona doc review | 2 | CLEAR | round 1 headless (7 safe_auto fixes); round 2 interactive (8 applied / 7 deferred / 1 skipped) |

**VERDICT:** PARTIAL — Doc Review and Design Review have run; CEO + Eng + Codex reviews not yet started. Eng Review is the required shipping gate — recommend `/plan-eng-review` before /ce-work.

**UNRESOLVED:** 10 deferred design + product decisions in §9 Deferred / Open Questions. None block execution but each is a real choice worth a read.

---

## 10. Animation storyboards

These storyboards are written in the Interface Craft (Josh Puckett) storyboard pattern — every timing value, scale, and spring config lives in a named constant so an implementer can scan the storyboard and tune any value instantly. They live here as **design specifications**, not literal code — the implementer translates them to the project's actual motion library (Framer Motion via `motion.div`, plain CSS, or whatever U2's BottomSheet ends up using).

### 10a. Sheet open + rail dismiss (coordinated)

Resolves §9 open question "Sheet z-stack with SheetEntryRail when both visible" — the rail slides down out of viewport at the same moment the sheet slides up. Single coordinated transition, two paths, one duration.

```
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Sheet open coordination
 *
 * Trigger: user taps a SheetEntryRail trigger button.
 *
 *    0ms   sheet starts at translateY(100%)
 *          rail at translateY(0)
 *          backdrop opacity 0
 *
 *    0ms   sheet begins translateY → 0
 *          rail begins translateY → 100% (slides off-screen)
 *          backdrop begins opacity → 1
 *          (all three on the same 200ms ease-out curve)
 *
 *  200ms   sheet at translateY(0), fully open
 *          rail at translateY(100%), off-viewport
 *          backdrop opacity 1
 *          focus moves to close button
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  openDuration: 200,   // ms — sheet + rail + backdrop share this
  focusDelay:   200,   // ms — close button focus moves at transition end
};

const SHEET = {
  closedY:  '100%',                                // translateY when closed
  openY:    '0',                                    // translateY when open
  easing:   'ease-out',
  zIndex:   50,
};

const RAIL = {
  visibleY:  '0',                                   // translateY when no sheet open
  hiddenY:   '100%',                                // translateY when any sheet open
  easing:    'ease-out',                            // same curve as SHEET so they read as one motion
  zIndex:    10,                                    // beneath sheet + backdrop
};

const BACKDROP = {
  hiddenOpacity:  0,
  visibleOpacity: 1,
  easing:         'ease-out',
  zIndex:         40,                                // between rail and sheet
};
```

**Stage logic (component body, conceptual):**
- Single `openSheet` state (`null | VipsDimension | 'trajectory'`)
- When `openSheet` flips non-null:
  - `SHEET.translateY = SHEET.openY`
  - `RAIL.translateY = RAIL.hiddenY`
  - `BACKDROP.opacity = BACKDROP.visibleOpacity`
- When `openSheet` flips back to `null`: reverse all three on the same 200ms curve
- All three elements use `transition: transform 200ms ease-out` (or `opacity` for the backdrop) — no individual stagger, no spring physics this plan (motion polish lands later)

**Why one curve, not three:** if the sheet, rail, and backdrop each had different easings or durations, the open would read as three things happening at once instead of one coordinated state change. The Quiet Mirror identity asks for calm; calm motion = synchronized motion.

**Quick checklist:**
- [ ] All three elements reference `TIMING.openDuration` — no magic 200s in JSX
- [ ] `RAIL.easing` and `SHEET.easing` are the same string (verify they read as one motion when you watch it)
- [ ] Backdrop z-index sits between rail and sheet so tap-on-backdrop closes the sheet but tap-on-rail (while open) doesn't fire the rail's onClick

---

### 10b. EmotionPicker overlay entrance (in-session, optional)

The picker no longer blocks the post-Stop pause — the user can ignore it entirely and let Mirror's `inferred_emotion` carry the read. But when the user *does* tap the in-session chip during recording, the picker overlay should still arrive with intent: this is the user actively saying *"let me name this myself."* The entrance is faster and tighter than the deferred post-Stop version — recording is still happening, the user wants to pick and get back to talking.

```
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — EmotionPicker overlay entrance
 *
 * Trigger: user taps the in-session emotion chip during
 *          `phase === 'recording'`. Recorder does NOT pause.
 *
 *    0ms   chip transforms to popover anchor
 *          backdrop fades in 0 → 0.3 (semi-transparent — recording
 *          should remain visible behind the picker)
 *
 *   80ms   picker panel slides up + scales 0.92 → 1.0 from chip's
 *          anchor point. anchor-aware: chip is bottom-right, so
 *          panel grows up-and-leftward, not centered
 *
 *  160ms   9 emotion tiles fade in as a group (no individual stagger
 *          — keep it fast; the user is mid-recording)
 *          opacity 0 → 1, scale 0.95 → 1.0
 *
 *  240ms   keyboard focus moves to the last-used tile (or 'joy' on
 *          first use); picker is interactive
 *
 *  --- dismiss ---
 *
 *  user picks OR taps backdrop OR Esc:
 *  - panel reverses in 200ms ease-out (slide down + scale to 0.92)
 *  - backdrop fades to 0
 *  - chip label updates to picked value (or stays unchanged on dismiss)
 *  - focus returns to the chip
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  backdropIn:   0,     // ms — semi-transparent backdrop arrives first
  panelIn:      80,    // ms — picker panel slides + scales up
  tilesIn:      160,   // ms — tiles fade in as a group (no stagger)
  focusReady:   240,   // ms — focus lands, picker interactive
  dismiss:      200,   // ms — reverse transition on close
};

const BACKDROP = {
  hiddenOpacity:  0,
  visibleOpacity: 0.3,                              // semi-transparent — recording stays visible
  easing:         'ease-out',
};

const PANEL = {
  anchorOrigin:  'bottom-right',                    // grows up-and-leftward from chip
  initialScale:  0.92,
  finalScale:    1.0,
  initialY:      8,                                 // px — slides up 8px into place
  finalY:        0,
  spring:        { type: 'spring', stiffness: 420, damping: 28 },
};

const TILES = {
  initialOpacity: 0,
  finalOpacity:   1,
  initialScale:   0.95,
  finalScale:     1.0,
  groupReveal:    true,                             // no per-tile stagger — fast in
  spring:         { type: 'spring', stiffness: 400, damping: 28 },
  items: [
    { value: 'joy',         shape: 'circle',         label: 'Joy' },
    { value: 'sadness',     shape: 'drop',           label: 'Sadness' },
    { value: 'anger',       shape: 'diamond',        label: 'Anger' },
    { value: 'fear',        shape: 'cube',           label: 'Fear' },
    { value: 'disgust',     shape: 'ring',           label: 'Disgust' },
    { value: 'anxiety',     shape: 'capsule',        label: 'Anxiety' },
    { value: 'envy',        shape: 'ellipse',        label: 'Envy' },
    { value: 'embarrassed', shape: 'stepped-blocks', label: 'Embarrassed' },
    { value: 'ennui',       shape: 'disk',           label: 'Ennui' },
  ],
};
```

**Stage logic:**
- `EmotionPicker` mounted with `layout="overlay"` and `entrance={true}` runs the staged reveal above (default for the U5 in-session chip use case). Mounted with `entrance={false}` skips the timer choreography — useful in tests and the dev `?inject=` seam, and as the future polish-plan default if the team decides motion should be optional.
- Stage state: `0` (chip pressed, nothing yet) → `1` (backdrop fading in) → `2` (panel sliding up) → `3` (tiles visible) → `4` (focus landed, interactive).
- Recorder is **not paused**. The audio + video streams continue. The picker is a UI overlay; it has no lifecycle hooks into `MediaRecorder`.
- Dismiss is the reverse — 200ms ease-out on panel + backdrop, focus returns to the chip.

**Why this is shorter than the previous post-Stop entrance:** the user is mid-recording. They want to pick and get back to themselves. A 240ms total entrance is decisive without rushing; an 800ms staggered reveal would feel decorative against the live capture. Group-reveal on tiles (no per-tile stagger) keeps the picker readable as one unit — pick fast, move on.

**Why springs on the panel but not the tiles:** the panel is the thing the user just summoned by tapping a button — spring physics gives it the tactile arrival of "this came when I asked for it." The tiles are a passive group inside the panel; group-fade preserves the "panel = one thing" reading.

**Quick checklist:**
- [ ] Zero magic numbers in `EmotionPicker.tsx` — everything references `TIMING` / `BACKDROP` / `PANEL` / `TILES`
- [ ] Tile `items` array drives render order (same shape↔emotion pairing committed by the polish-deferred mapping)
- [ ] Backdrop opacity caps at `0.3` — the recording view is still visible behind it (recording is still happening)
- [ ] Focus returns to the chip (not the page body) on dismiss — keyboard users can re-open without re-tabbing
- [ ] `entrance={false}` skips the entire staged reveal — useful for tests and the dev `?inject=` seam
