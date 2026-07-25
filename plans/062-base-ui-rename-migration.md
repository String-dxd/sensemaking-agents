# Plan 062: Migrate off the deprecated `@base-ui-components/react` onto `@base-ui/react`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 031d1974..HEAD -- package.json src/components/ui/ src/components/student-space/ src/components/DevPalette.tsx src/routes/_dev.dev.design.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (behavior layer for every dialog, drawer, and radio group in the app)
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

`npm view @base-ui-components/react` reports
`deprecated: 'Package was renamed to @base-ui/react'`, and its
`dist-tags.latest` is frozen at `1.0.0-rc.0` — **exactly the version pinned in
`package.json`**. The renamed package `@base-ui/react` is at `1.6.0` and has
shipped a stable `1.0.0` plus five minors since. So today the app's entire
accessible-behavior layer — focus traps, Escape-to-close, portalling, radio
roving-tabindex — sits on a **release candidate of an abandoned package name**,
and will never receive another accessibility or React-19 fix. `CLAUDE.md` names
this layer load-bearing: "Base UI for behavior, hand-rolled shadcn-style
visuals … dialogs, drawers, radio groups, focus traps." The migration is a
specifier rewrite plus an API diff; the cost of not doing it compounds silently
until something breaks that nobody can fix.

## Current state

### The dependency

`package.json:37`:

```json
    "@base-ui-components/react": "1.0.0-rc.0",
```

Exact-pinned (no `^`). Registry facts verified at planning time:

| | `@base-ui-components/react` | `@base-ui/react` |
|---|---|---|
| `dist-tags.latest` | `1.0.0-rc.0` | `1.6.0` |
| deprecated | **yes** — "Package was renamed to @base-ui/react" | no |
| version line | ends at rc.0 | `1.0.0-rc.1`, `rc.2`, `1.0.0`, `1.1.0` … `1.6.0` |

The version histories are contiguous: `@base-ui/react` picks up at `rc.1`
where the old name stops. `@base-ui/react`'s peer deps are `react`,
`react-dom` (`^17 || ^18 || ^19` — React 19 supported) plus **optional** peers
`@types/react`, `date-fns`, `@date-fns/tz` (`peerDependenciesMeta` marks all
three optional; the date-fns ones are for date-picker components this repo does
not use, so no new install is required).

### Every import site — 14 statements across 11 files

```
src/components/ui/alert-dialog.tsx:1   import { AlertDialog as BaseAlertDialog } from '@base-ui-components/react/alert-dialog'
src/components/ui/button.tsx:1         import { Button as BaseButton } from '@base-ui-components/react/button'
src/components/ui/dialog.tsx:1         import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
src/components/ui/drawer.tsx:1         import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
src/components/ui/radio-group.tsx:1    import { Radio as BaseRadio } from '@base-ui-components/react/radio'
src/components/ui/radio-group.tsx:2    import { RadioGroup as BaseRadioGroup } from '@base-ui-components/react/radio-group'
src/components/DevPalette.tsx:1        import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
src/components/student-space/capture/CaptureChooser.tsx:1  import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
src/components/student-space/capture/CaptureFab.tsx:1      import { Button as BaseButton } from '@base-ui-components/react/button'
src/components/student-space/onboarding/EggHatcher.tsx:1   import { Radio } from '@base-ui-components/react/radio'
src/components/student-space/onboarding/SkipButton.tsx:1   import { Button as BaseButton } from '@base-ui-components/react/button'
src/components/student-space/sheets/CalendarPane.tsx:1     import { Button as BaseButton } from '@base-ui-components/react/button'
src/components/student-space/sheets/CalendarPane.tsx:2     import { Toggle } from '@base-ui-components/react/toggle'
src/components/student-space/sheets/CalendarPane.tsx:3     import { ToggleGroup } from '@base-ui-components/react/toggle-group'
```

Plus **two string references** (not imports) in the dev design-system page:

- `src/routes/_dev.dev.design.tsx:636` — a code snippet shown to the reader:
  `` snippet={`import { Dialog as BaseDialog } from\n  '@base-ui-components/react/dialog'`} ``
- `src/routes/_dev.dev.design.tsx:662` — the version label inside a
  "Do not install Radix" card:

```tsx
            The primitive layer is{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              @base-ui-components/react@1.0.0-rc.0
            </code>
            . shadcn officially supports Base UI as of January 2026. ...
```

Both must be updated so the documented convention matches reality.

### Exactly seven Base UI component families are in use

`grep -rho "@base-ui-components/react/[a-z-]*" src/ | sort | uniq -c`:

| Subpath | Uses |
|---|---|
| `/dialog` | 4 imports (+1 in the snippet string) |
| `/button` | 4 |
| `/radio` | 2 |
| `/alert-dialog` | 1 |
| `/radio-group` | 1 |
| `/toggle` | 1 |
| `/toggle-group` | 1 |

**Only these seven need an API diff.** Anything else in the Base UI changelog is
irrelevant to this migration.

The specific sub-components touched (read each file to confirm before editing):

- `Dialog.Root`, `Dialog.Trigger`, `Dialog.Close`, `Dialog.Portal`,
  `Dialog.Backdrop`, `Dialog.Popup`, `Dialog.Title`, `Dialog.Description` —
  see `src/components/ui/dialog.tsx:1-40` and
  `src/components/ui/drawer.tsx:17-150`
- `AlertDialog.*` — `src/components/ui/alert-dialog.tsx`
- `Button` — `src/components/ui/button.tsx`
- `Radio.*` / `RadioGroup.*` — `src/components/ui/radio-group.tsx`
- `Toggle` / `ToggleGroup` — `src/components/student-space/sheets/CalendarPane.tsx`

The Base UI styling hooks the local components depend on are the
`data-[starting-style]` / `data-[ending-style]` attributes — e.g.
`src/components/ui/dialog.tsx:14-18`:

```tsx
    <BaseDialog.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-200 ease-out',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
```

**If those data attributes were renamed between rc.0 and 1.6.0, every enter/exit
animation in the app silently stops working while all tests still pass.** They
are a specific thing to check in the changelog and to confirm visually in
step 5.

### CORRECTION to `CLAUDE.md` — read this before you go looking

`CLAUDE.md` says routed sheets compose on "Base UI `Dialog.Root`,
`modal={false}`". **That is stale.** `src/components/ui/sheet.tsx` imports **no
Base UI at all** — its own docblock at lines 19-23 says so:

```
/**
 * Full-viewport routed page surface. Plain framed div — not a Base UI Dialog.
 * Each routed page (History, Profile, Letters, Trajectory, Settings) is its
 * own surface that sits above the (hidden) world canvas. There is no portal
 * remount on navigation, ...
 *
 * Capture surfaces (Ask/Mood) continue to use `<Drawer>`.
 */
```

So the **routed sheets are not at risk** from this migration; the Base UI
surfaces that *are* at risk are:

| Surface | Component | Consumer |
|---|---|---|
| Ask capture sheet | `Drawer` (Base UI `Dialog`) | `src/components/student-space/capture/AskSheet.tsx:12` |
| Mood capture sheet | `Drawer` | `src/components/student-space/capture/MoodSheet.tsx:3` |
| Mobile nav | `Drawer` | `src/components/student-space/navigation/MobileNav.tsx:4` |
| Capture chooser | Base UI `Dialog` directly | `src/components/student-space/capture/CaptureChooser.tsx:1` |
| Dev palette | Base UI `Dialog` via `ui/dialog` | `src/components/DevPalette.tsx:6` |
| Onboarding species picker | `RadioGroup` | `src/components/student-space/onboarding/EggHatcher.tsx:5` |
| Calendar month/filter toggles | `Toggle` / `ToggleGroup` | `src/components/student-space/sheets/CalendarPane.tsx:2-3` |
| Buttons throughout | `Button` | `ui/button.tsx`, `CaptureFab.tsx`, `SkipButton.tsx`, `CalendarPane.tsx` |
| Dev design page | `AlertDialog`, `Dialog`, `Drawer`, `RadioGroup` | `src/routes/_dev.dev.design.tsx:26-45` |

Do **not** update `CLAUDE.md` in this plan (out of scope, and the advisor owns
docs drift — see plan 064). Just do not waste time hunting for a `Dialog.Root`
in `sheet.tsx`.

### Repo conventions

pnpm only, **one root lockfile**; `island-editor` is a workspace member. Neither
`island-editor/` nor `bird-builder/` imports Base UI (verified) — this migration
is root-app-only.
`pnpm check` = `biome check src test && tsc --noEmit` — exit 0 today with **18
pre-existing lint warnings**. `pnpm test` = `vitest run`; baseline **911
passed / 128 skipped / 0 failed**. `pnpm vitest run <path>` for one file.
Tests live in `test/` mirroring `src/`. Conventional commits.
Per `CLAUDE.md`: **never** add `three` to `overrides` — the 0.149-app /
0.171-editor runtime split is deliberate. Do not reach for `overrides` for this
migration either; it is a straight dependency swap.
Also per `CLAUDE.md`: do **not** install the `shadcn/ui` package. Visual
primitives stay hand-rolled in `src/components/ui/*`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Registry check (old) | `npm view @base-ui-components/react deprecated dist-tags` | deprecation string + `latest: 1.0.0-rc.0` |
| Registry check (new) | `npm view @base-ui/react version` | a `1.x` version (`1.6.0` at planning time) |
| Install new | `pnpm add @base-ui/react@<version>` | exit 0 |
| Remove old | `pnpm remove @base-ui-components/react` | exit 0 |
| Check | `pnpm check` | exit 0 (18 warnings OK, 0 errors) |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| Dev server | `PORT=3100 pnpm dev` | serves at `http://localhost:3100` |
| Grep gate | `grep -rn '@base-ui-components/react' src/ package.json` | no matches (after step 4) |

## Suggested executor toolkit

- If a `migrate-radix-to-base` skill is available, it may carry the Base UI
  API-change tables; consult it for the rc.0 → 1.x diff rather than guessing.
- If an `agent-browser` skill is available, use it for step 5's manual
  verification (navigate, screenshot, send Escape/Tab keys). Otherwise do
  step 5 by hand in a real browser — it is **not** optional.
- Base UI's own changelog/release notes for the seven components in use are the
  authoritative source for the API diff. Read them before editing.

## Scope

**In scope** (the only files you should modify):

- `package.json` (swap the dependency)
- `pnpm-lock.yaml` (regenerated)
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/drawer.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/DevPalette.tsx`
- `src/components/student-space/capture/CaptureChooser.tsx`
- `src/components/student-space/capture/CaptureFab.tsx`
- `src/components/student-space/onboarding/EggHatcher.tsx`
- `src/components/student-space/onboarding/SkipButton.tsx`
- `src/components/student-space/sheets/CalendarPane.tsx`
- `src/routes/_dev.dev.design.tsx` (the two string references only)
- Any existing test that mocks or asserts on Base UI internals, **only** if the
  new version's DOM structure genuinely changed (see STOP conditions)

**Out of scope** (do NOT touch, even though they look related):

- `src/components/ui/sheet.tsx` — no Base UI import; the routed-sheet chrome is
  a plain framed div. Nothing to migrate.
- `CLAUDE.md` — its Base UI paragraph is stale about `sheet.tsx`, but docs drift
  is plan 064's and the advisor's territory.
- Any **visual** change: no new classes, no restyling, no token changes. If the
  new version ships different default styling, neutralize it with the existing
  classes rather than redesigning.
- Installing `shadcn/ui` or a Radix package — explicitly forbidden by
  `CLAUDE.md` and by the dev design page's own "Do not install Radix" card.
- `island-editor/`, `bird-builder/` — isolated workspace roots, no Base UI.
- `overrides` in `package.json` — not needed and workspace-global.

## Git workflow

- Branch: `advisor/062-base-ui-rename-migration`
- Conventional commits, e.g.
  `chore(deps): move from deprecated @base-ui-components/react to @base-ui/react`,
  `refactor(ui): adapt to Base UI 1.x API`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the registry facts and pick the target version

```bash
npm view @base-ui-components/react deprecated dist-tags
npm view @base-ui/react version
npm view @base-ui/react peerDependencies peerDependenciesMeta
```

Record the exact `@base-ui/react` version you are targeting; use that literal
version everywhere below.

**Verify**: the first command prints the deprecation notice and
`latest: '1.0.0-rc.0'`. The second prints a `1.x` version. The third confirms
`react` / `react-dom` accept `^19` and that `date-fns` / `@date-fns/tz` are
**optional** peers (so no extra installs).

If `@base-ui-components/react` is **not** deprecated, or `@base-ui/react` does
not exist, STOP — the audit's premise is wrong.

### Step 2: Diff the rc.0 → target API for the seven components in use

Before touching code, produce a written mapping table for exactly these seven:
`dialog`, `button`, `radio`, `radio-group`, `alert-dialog`, `toggle`,
`toggle-group`. Read the Base UI release notes / changelog between `1.0.0-rc.1`
and your target version, and read each local consumer file to know which
sub-components and props are actually used.

Specific things to answer explicitly, because they are the ones that break
silently:

1. Are the sub-component names unchanged? (`Dialog.Root`, `.Trigger`, `.Close`,
   `.Portal`, `.Backdrop`, `.Popup`, `.Title`, `.Description`;
   `Radio.Root`/`Radio.Indicator`; `RadioGroup`; `Toggle`; `ToggleGroup`;
   `AlertDialog.*`)
2. Is the `modal` prop on `Dialog.Root` unchanged?
3. **Are the `data-starting-style` / `data-ending-style` attributes
   unchanged?** They drive every enter/exit transition in
   `ui/dialog.tsx`, `ui/drawer.tsx`, and `ui/alert-dialog.tsx`. A rename here is
   invisible to `pnpm check` and to every test.
4. Are the subpath exports (`@base-ui/react/dialog` etc.) still per-component,
   or did the package move to a single root export?
5. Did `Button`'s `render` / `nativeButton` prop surface change?

**Verify**: you have a written table with one row per changed symbol/prop, and
"no change" recorded for each of the seven where nothing changed. If anything
beyond a mechanical specifier rewrite changed, **report the table before
editing any code** (STOP condition).

### Step 3: Install the new package alongside, rewrite the specifiers, remove the old

```bash
pnpm add @base-ui/react@<target-version>
```

Then rewrite all 14 import statements. The mechanical part is the specifier
(`@base-ui-components/react/x` → `@base-ui/react/x`); apply the step-2 mapping
table for anything else. Keep every local alias (`BaseDialog`, `BaseButton`,
`BaseRadio`, `BaseRadioGroup`, `BaseAlertDialog`) so the rest of each file is
untouched.

Then:

```bash
pnpm remove @base-ui-components/react
```

**Verify**: `grep -rn '@base-ui-components/react' src/` → only the two string
references in `src/routes/_dev.dev.design.tsx` remain (step 4 handles them).
**Verify**: `grep -n 'base-ui' package.json` → exactly one line,
`"@base-ui/react": "<target-version>"`.
**Verify**: `pnpm check` → exit 0, 0 errors.
**Verify**: `pnpm test` → ≥911 passed, 0 failed, skip count still 128.

### Step 4: Update the dev design page's documented convention

In `src/routes/_dev.dev.design.tsx`:

- line ~636: change the displayed snippet to
  `` `import { Dialog as BaseDialog } from\n  '@base-ui/react/dialog'` ``
- line ~662: change the version label from
  `@base-ui-components/react@1.0.0-rc.0` to
  `@base-ui/react@<target-version>`

Leave the surrounding "Do not install Radix" copy alone — it is still the
policy.

**Verify**: `grep -rn '@base-ui-components/react' src/ package.json` → **no
matches**.
**Verify**: `pnpm check` → exit 0.

### Step 5: MANDATORY manual verification of every Base UI surface

Tests cover none of this — focus trapping, Escape handling, and enter/exit
transitions are browser behavior. Start the dev server on an explicit port (the
README notes port 3000 may be taken):

```bash
PORT=3100 pnpm dev
```

Sign in with "Use a demo account" on the login screen (no WorkOS variables
needed — `README.md:110-113`).

Work the checklist. **Every row must be ticked.** A row that fails is a STOP
condition.

**Routed pages (regression check — these use `sheet.tsx`, no Base UI, so they
must be completely unaffected):**

- [ ] `/` — world canvas renders; side rail visible
- [ ] `/profile` and `/profile/values` — page renders, sidenav navigates
- [ ] `/history` and `/history/growth` — page renders, tabs switch
- [ ] `/letters` — page renders, a letter opens
- [ ] `/trajectory` — page renders
- [ ] `/settings` — page renders

**Base UI surfaces (the actual migration risk):**

- [ ] **Ask capture sheet** (`Drawer`) — open it from the capture FAB on `/`.
      Confirm: it animates in from the bottom; **Tab cycles only inside the
      drawer** (focus trap); **Escape closes it**; it animates out (does not
      snap).
- [ ] **Mood capture sheet** (`Drawer`) — same three checks.
- [ ] **Capture chooser** (Base UI `Dialog`) — opens, backdrop dims, Escape
      closes, focus is trapped.
- [ ] **Mobile nav drawer** — narrow the window below 640px, open the hamburger,
      confirm the drawer opens from the left, traps focus, and Escape closes it.
- [ ] **Onboarding species picker** (`RadioGroup`) — go to `/onboarding`
      (or "Restart onboarding" in `/settings`). Confirm arrow keys move the
      selection (roving tabindex) and Space/Enter selects.
- [ ] **Calendar toggles** (`Toggle` / `ToggleGroup`) — on `/history`, click the
      month/filter toggles; confirm pressed state and keyboard activation.
- [ ] **Buttons** — the capture FAB and the onboarding Skip button respond to
      click **and** to keyboard Enter/Space.
- [ ] **Dev design page** — visit `/dev/design`; exercise its AlertDialog,
      Dialog, Drawer, and RadioGroup demos. This page is the one place all
      four appear together.
- [ ] **Transitions** — for at least one Drawer and one Dialog, confirm the
      enter *and* exit animation still plays. If either snaps instantly, the
      `data-starting-style` / `data-ending-style` contract changed (step 2,
      question 3) — STOP.

**Verify**: every checkbox above is ticked, and you have recorded which browser
and viewport you tested. Paste the completed checklist into your report.

### Step 6: Final gate

**Verify**: `pnpm check` → exit 0, 0 errors, ≤18 warnings.
**Verify**: `pnpm test` → ≥911 passed, 0 failed, skip count 128.
**Verify**: `pnpm build` → exit 0. (Worth running once here: a dependency swap
is exactly the kind of change that can break the production bundle while dev
and tests stay green.)
**Verify**: `git status` → only in-scope files modified.

## Test plan

- **No new automated tests.** This migration changes no behavior the repo
  asserts; every existing test must pass **unchanged**. A test that needs
  editing means the new version's DOM structure changed — see STOP conditions.
- The real verification is step 5's manual checklist, which is mandatory
  precisely because Vitest + happy-dom does not exercise focus traps,
  `Escape` handling, or CSS transitions.
- Existing tests that touch these surfaces and must stay green (run them
  individually if the full suite is noisy):
  `pnpm vitest run test/components/student-space` and
  `pnpm vitest run test/components/ui` (if present — otherwise the full
  `pnpm test` covers it).
- `pnpm build` is part of the gate for this plan only, because a dependency
  swap can break bundling without breaking tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn '@base-ui-components/react' src/ package.json` → no matches
- [ ] `grep -c 'base-ui' package.json` → `1`, and that line is `"@base-ui/react"`
- [ ] `grep -rn '@base-ui/react' src/ | wc -l` → `15` (14 imports + 1 snippet string)
- [ ] `pnpm check` exits 0 with 0 errors
- [ ] `pnpm test` exits 0, ≥911 passed, 0 failed, skip count 128
- [ ] `pnpm build` exits 0
- [ ] `grep -n 'shadcn/ui\|@radix-ui' package.json` → no matches (nothing forbidden crept in)
- [ ] `grep -n 'overrides' package.json` → no new `overrides` block added
- [ ] Step 5's manual checklist is complete and pasted into the report, with
      every row ticked
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Step 2 finds that the stable API renamed props or sub-components used in
  `ui/dialog.tsx`, `ui/drawer.tsx`, `ui/alert-dialog.tsx`, or
  `ui/radio-group.tsx` beyond a mechanical mapping.** Report the full mapping
  table and wait — a multi-prop rename across the app's dialog chrome deserves
  a human look before it lands.
- **Any accessibility behavior differs.** Specifically: focus is not trapped
  inside an open Drawer/Dialog, Escape no longer closes, the RadioGroup loses
  arrow-key navigation, or a Button stops responding to Enter/Space. These are
  the reasons Base UI is in the dependency list at all; a regression here is
  worse than staying on the deprecated package. STOP and report which surface
  and which behavior.
- **An enter or exit transition stops playing** (a Drawer/Dialog snaps instead
  of animating). That means the `data-starting-style` / `data-ending-style`
  attribute contract changed. STOP — the fix is a class rewrite across three
  `ui/` files and should be decided deliberately, not improvised.
- **`pnpm install` pulls in more than the expected dependency change.** Compare
  `git diff pnpm-lock.yaml` — you should see `@base-ui-components/react`
  removed and `@base-ui/react` added, with no unrelated version churn. Do NOT
  reach for `overrides` to pin something; report the diff instead.
- **An existing test fails.** Investigate first: if the new version emits a
  different DOM structure (e.g. an extra wrapper element) and the test asserts
  on it, adapting the test is in scope — say so explicitly in the report. If
  the failure is behavioral, that is the accessibility STOP above.
- `pnpm build` fails after the swap — report the error; do not paper over it
  with a bundler config change.
- The import inventory in "Current state" does not match `grep -rn
  '@base-ui-components/react' src/` (drift since planning).

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinize**: (1) the completed step-5 checklist —
  no automated gate covers focus trapping or Escape, so the checklist *is* the
  evidence; (2) the `pnpm-lock.yaml` diff, for unrelated version churn;
  (3) that no class strings changed in `ui/dialog.tsx`, `ui/drawer.tsx`,
  `ui/alert-dialog.tsx`, `ui/button.tsx`, or `ui/radio-group.tsx` — the visuals
  are hand-rolled and this plan must not touch them.
- **The version should get a caret after this lands.** The old dependency was
  exact-pinned (`1.0.0-rc.0`) because it was a release candidate; on a stable
  `1.x` a `^` range is appropriate and lets minor accessibility fixes arrive
  without a plan. Decide this in review; the plan installs whatever `pnpm add`
  produces.
- **`CLAUDE.md` is stale on this seam** and this plan deliberately does not fix
  it: it says routed sheets build on Base UI `Dialog.Root`, but
  `src/components/ui/sheet.tsx` is a plain framed div and imports no Base UI.
  Whoever updates `CLAUDE.md` next should correct that sentence to name the
  actual Base UI surfaces (capture Drawers, CaptureChooser, DevPalette,
  RadioGroup, Toggle/ToggleGroup, Button). Flag it in the PR description so it
  is not lost.
- **Follow-up worth considering**: the seven-component footprint is small
  enough that the "which surfaces depend on Base UI" table in this plan's
  "Current state" is worth moving into `/dev/design` next to the existing
  "Do not install Radix" card, so the next migration does not need an audit to
  reconstruct it.
