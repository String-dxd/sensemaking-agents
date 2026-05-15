---
title: "feat: Align profile sheet information architecture with Student Space"
type: feat
status: active
date: 2026-05-14
origin: user request with Student Space reference screenshots
---

# feat: Align profile sheet information architecture with Student Space

## Summary

Replace the profile bottom-sheet directory with the Student Space profile-sheet information architecture: identity header, four VIPS tabs, a student-voice page title, ranked claim rows, compiled profile read, open question callout, collection, and timeline. Keep this app's auth, routing, VIPS database rows, timeline mutations, and review flows intact.

## Scope

- Change the profile and VIPS page presentation in `src/components/ProfileSheetView.tsx`, `src/components/VipsPageView.tsx`, and `src/routes/index.tsx`.
- Reuse the Student Space reference structure from `student-space-v1/sources/Game/View/ProfileSheet.js` and `student-space-v1/sources/Game/View/facets.js`.
- Do not import Student Space runtime state, localStorage, overlay controller, or CSS directly.
- Keep Library and Trajectory as separate sheet destinations.

## Key Decisions

- `/?sheet=profile` should open directly to the Values tab, matching Student Space's default active profile facet instead of showing a directory.
- VIPS dimension sheets should carry the same profile identity and tab chrome so navigation feels like one profile surface.
- Collection tiles should be backed by this repo's closed VIPS taxonomy and timeline counts, not Student Space seed data.
- Timeline forget/source behavior remains the existing app behavior.

## Implementation Units

### U1. Shared Profile Chrome

Files:

- `src/components/ProfileSheetChrome.tsx`
- `test/components/ProfileSheetView.test.tsx`
- `test/components/VipsPageView.test.tsx`

Work:

- Add Student Space-inspired identity header, tab row, facet labels, facet themes, and student-voice headers.
- Keep sign-in/sign-out affordances available without making them the primary information architecture.

Test scenarios:

- The identity header renders with the Student Space-style avatar, name/class line, and VIPS tabs.
- Clicking a tab calls the parent sheet navigation callback.

### U2. Profile Sheet Default

Files:

- `src/routes/index.tsx`
- `src/components/ProfileSheetView.tsx`

Work:

- Make the profile entry open the Values page by default when VIPS data is loaded.
- Keep a signed-out and loading fallback that uses the same Student Space chrome instead of the old Library/Pages card directory.

Test scenarios:

- `sheet=profile` renders Values content when data exists.
- Signed-out actions remain reachable.

### U3. VIPS Page IA

Files:

- `src/components/VipsPageView.tsx`
- `test/components/VipsPageView.test.tsx`
- `test/components/SheetVipsPageView.test.tsx`

Work:

- Replace the old "Profile page / Current read / Timeline" hierarchy with Student Space's page header.
- Add Most common and Quietly emerging rows based on timeline claim counts.
- Add taxonomy-backed Collection tiles that filter the visible timeline by canonical claim.
- Keep the existing timeline entry actions and tests for forget/source behavior.

Test scenarios:

- The page renders the Student Space title and open question callout.
- Collection tiles show taxonomy labels and counts.
- Selecting a collection tile filters timeline entries for that claim and selecting again clears the filter.
