---
title: "feat: Simplify the dev pipeline test bench"
type: feat
status: active
date: 2026-05-20
origin: user request
related:
  - plans/CURRENT_STATE.md
  - src/routes/dev.pipeline.tsx
  - src/components/DevPalette.tsx
---

# feat: Simplify the dev pipeline test bench

## Summary

Simplify `/dev/pipeline` from a dense backend inspection surface into a focused
test bench for proving the full Mirror -> Connector -> VIPS -> Cartographer
path. The first screen should answer two questions quickly:

1. Can I run the complete backend/agent flow end to end?
2. Did each stage pass, fail, or need attention?

Detailed evidence still matters, but it should sit behind progressive detail
sections instead of competing with the primary run controls.

## Problem Frame

The current `/dev/pipeline` page exposes useful machinery, but too much of it
has equal weight: four health cards, a large end-to-end panel, a large Realtime
panel, trace evidence, connector graph, VIPS pages, Cartographer output, and
mirror rows. For a developer trying to test "does the backend and agent chain
work?", this forces visual parsing before action.

The page should behave more like an operator console: one primary action, clear
stage status, concise logs, and drill-down evidence for debugging.

## Requirements

- R1. Keep `/dev/pipeline` dev-only and reachable from the Cmd-K command
  palette.
- R2. Preserve the existing backend actions: Realtime transcript capture,
  Mirror run, Connector run, Cartographer run, and full backend flow.
- R3. Make `Run full backend flow` the dominant default action.
- R4. Replace the four separate health cards with a compact stage timeline or
  checklist that shows Mirror, Connector, VIPS, and Cartographer state.
- R5. Keep the transcript editable, but reduce its footprint until the user is
  actively editing or using Realtime.
- R6. Keep Realtime available, but present it as an optional transcript source
  rather than a peer primary panel.
- R7. Move connector graph, VIPS pages, Cartographer details, and mirror rows
  into lower-priority details sections.
- R8. Preserve the current evidence/debugging affordances so failures remain
  diagnosable.
- R9. Maintain focused tests for the new layout, action availability, Realtime
  transcript handoff, filtering, and row expansion.

## Scope Boundaries

- No backend route, server function, agent prompt, database, or provider changes.
- No changes to `/` Student Space runtime beyond Cmd-K navigation behavior that
  already exists.
- No removal of trace evidence; only re-prioritization and progressive reveal.
- No redesign of shadcn/base UI primitives.
- No full visual design system rewrite.

## Existing Patterns To Follow

- `src/routes/dev.pipeline.tsx` already owns the route, loader data, Realtime
  capture lifecycle, action runners, health summary, connector graph, and
  evidence tables.
- `test/routes/dev.pipeline.test.tsx` already renders `PipelinePageView`
  directly and covers visible controls, Realtime transcript handoff, connector
  graph rendering, filters, and row expansion.
- `src/components/DevPalette.tsx` already labels `/dev/pipeline` as `Test agent
  pipeline`.
- Existing UI primitives use `Button`, lucide icons, Tailwind utility classes,
  rounded borders, muted surfaces, and compact operational copy.

## Key Decisions

- **Use one primary workflow column.** The page should lead with transcript
  input, `Run full backend flow`, current status, and action log in one
  contained workspace.
- **Use a compact stage timeline instead of health cards.** Four cards make the
  page feel like a dashboard. A single horizontal/stacked timeline better
  communicates pipeline order and progress.
- **Treat Realtime as transcript input mode.** Realtime should sit near the
  transcript field as "Use live transcript" with start/stop controls and a
  small transcript log, not as a full competing panel.
- **Hide advanced evidence by default.** Connector graph, VIPS pages,
  Cartographer output, and Mirror table should use `details` sections or
  clearly lower-priority panels below the fold.
- **Keep debugging honest.** When a run fails, the action log and relevant
  detail section must still expose enough information to identify which agent
  or persistence step failed.
- **Avoid decorative redesign.** This is a dev tool. The polish should come
  from hierarchy, spacing, progressive disclosure, button state, tabular
  counters, and tighter copy.

## Implementation Units

### U1. Reframe the page shell and status hierarchy

**Goal:** Make the first screen read as a single pipeline test bench.

**Files**

- Modify: `src/routes/dev.pipeline.tsx`
- Test: `test/routes/dev.pipeline.test.tsx`

**Approach**

- Replace the current top health card strip with a compact ordered stage
  component: Mirror, Connector, VIPS, Cartographer.
- Show each stage with status, one key count, and a short tooltip/title where
  useful.
- Keep the header minimal: title, active student, refresh button, Cmd-K hint.
- Move filter pills out of the header and into the Mirror entries details
  section where they apply.

**Test Scenarios**

- The page renders `Agent pipeline test bench`.
- The stage timeline renders Mirror, Connector, VIPS, and Cartographer in
  order.
- Existing summary counts still appear in a compact form.
- Refresh trace remains available.

### U2. Build a single primary run workspace

**Goal:** Give developers one obvious place to run the end-to-end flow.

**Files**

- Modify: `src/routes/dev.pipeline.tsx`
- Test: `test/routes/dev.pipeline.test.tsx`

**Approach**

- Make `Run full backend flow` the primary button in the main workspace.
- Move individual stage buttons into a secondary row or a "Run one stage"
  details disclosure.
- Keep the transcript field in the main workspace, but reduce its default
  height and use concise labeling.
- Keep the action log visible below the main action with a small max height and
  tabular timestamps.
- Preserve current `runPipelineAction` behavior and heartbeat logging.

**Test Scenarios**

- `Run full backend flow` is visible and primary.
- Individual buttons for `Run initial chat`, `Run Connector`, and
  `Run sense-making` remain reachable.
- Empty transcript still produces the existing error message.
- Action log still starts with `Ready.` and updates during runs.

### U3. Fold Realtime into transcript input

**Goal:** Make live Realtime capture feel like an input option, not a separate
workflow.

**Files**

- Modify: `src/routes/dev.pipeline.tsx`
- Test: `test/routes/dev.pipeline.test.tsx`

**Approach**

- Place `Start Realtime transcript` and `Stop Realtime transcript` near the
  transcript field.
- Show Realtime stage as a small status pill.
- Render the live transcript log in a compact collapsible region, expanding
  automatically while recording or after captured content exists.
- Keep the existing stop behavior that copies the prepared Realtime transcript
  into the editable transcript field.
- Keep validation, inferred meaning, and reframe output under a small "Prepared
  Mirror draft" detail block.

**Test Scenarios**

- Starting Realtime calls `createRealtimeMirrorCapture` with the same
  `contextType` and update callback.
- Conversation updates render while recording.
- Stopping Realtime copies the final transcript into the transcript textarea.
- Prepared validation/meaning/reframe remain visible after capture.

### U4. Progressive disclosure for evidence and debugging

**Goal:** Keep all debugging data while reducing first-screen load.

**Files**

- Modify: `src/routes/dev.pipeline.tsx`
- Test: `test/routes/dev.pipeline.test.tsx`

**Approach**

- Move Connector graph into an `Agent evidence` or `Connector graph` details
  section below the main workspace.
- Move VIPS pages and Cartographer output into sibling details sections.
- Keep Mirror entries table as the final "Raw Mirror entries" section.
- Keep filter pills inside the Mirror entries section.
- Preserve row expansion and `LazyBlob` behavior for payload/debug blobs.

**Test Scenarios**

- Connector graph is still rendered and test-addressable.
- VIPS page text and Cartographer output remain visible when their sections are
  opened.
- Filter pills still narrow mirror rows by `review_status`.
- Expanding a mirror row still shows validation, inferred meaning, story
  reframe, diffs, and committed claims.

### U5. Polish interaction details

**Goal:** Make the simplified layout feel intentional and stable.

**Files**

- Modify: `src/routes/dev.pipeline.tsx`
- Test: `test/routes/dev.pipeline.test.tsx`

**Approach**

- Use exact transitions where needed; avoid `transition-all`.
- Add `active:scale-[0.96]` or equivalent tactile press states to local
  buttons if consistent with the existing button primitive.
- Use tabular numbers for stage counts and log timestamps.
- Keep minimum hit targets around 40px for primary controls.
- Use balanced headings and concise operational copy.
- Avoid nested cards and decorative visual noise.

**Test Scenarios**

- Buttons remain keyboard reachable by role/name.
- The simplified layout does not remove existing accessible names used in
  tests.
- No text-only status becomes color-only; status labels remain readable.

## Verification

- `./node_modules/.bin/vitest run test/routes/dev.pipeline.test.tsx test/components/DevPalette.test.tsx`
- `./node_modules/.bin/biome check src/routes/dev.pipeline.tsx test/routes/dev.pipeline.test.tsx`
- `./node_modules/.bin/tsc --noEmit`
- `git diff --check`
- Browser visual check at `http://127.0.0.1:3000/dev/pipeline`

## Risks

| Risk | Mitigation |
| --- | --- |
| Hiding evidence makes debugging slower. | Use native details sections with clear labels and keep failed-run logs visible. |
| Tests overfit to old labels. | Update tests around user-visible intent: primary run, Realtime handoff, graph presence, filters, expansion. |
| Realtime feels buried. | Keep start/stop controls adjacent to transcript and auto-expand the live log while active. |
| The page becomes too pretty for a dev tool. | Favor hierarchy and density over decorative styling. |

## Definition of Done

- First viewport has one obvious primary run path.
- Stage progress is readable at a glance without four separate dashboard cards.
- Realtime is still available and still copies into the backend transcript path.
- Connector graph, VIPS pages, Cartographer output, and Mirror rows remain
  available for debugging.
- Focused tests and TypeScript checks pass.
