---
title: "feat: Wire product data connectors into the world stage"
type: feat
status: draft
date: 2026-05-14
origin: docs/plans/2026-05-14-001-feat-student-space-rich-world-assets-plan.md
---

# feat: Wire product data connectors into the world stage

## Summary

The richer Student Space-inspired island now exposes three new visual layers that
ship as **decorative defaults** with placeholder descriptors:

- `MailboxDescriptor` — currently always `state: 'empty'`
- `MoodPinDescriptor[]` — currently empty array
- (Stars and ambient fireflies are pure visuals; no data connector needed.)

This plan covers wiring real product data through the existing
`buildVipsWorldSceneModel` boundary so the visuals reflect product state.

## Connector seam

`vipsWorldMapping.ts` is the only place that knows about product data shape;
the Three layer renders descriptors. New connectors should:

1. Read from existing server functions / queries.
2. Pass the data into `buildVipsWorldSceneModel({...})` via the new input fields:
   - `recentMoods?: VipsWorldRecentMood[]`
   - `mailbox?: { unreadBriefCount?: number; lastBriefId?: number | string | null }`
3. Never reach into `createWorldScene` directly.

## Connectors to land

### C1. Mailbox ⇄ Counsellor briefs

**Source.** `src/server/counsellor-brief.handler.server.ts` already returns
counsellor briefs for a student.

**Steps.**

- Add a thin `loadCounsellorBriefStatus` server function that returns
  `{ unreadCount, lastBriefId }` for the current student.
- In `routes/index.tsx` loader, prefetch + read this alongside `vips-pages`.
- Pass into `buildVipsWorldSceneModel({ mailbox: { unreadBriefCount, lastBriefId } })`.
- Mailbox flag on the island raises automatically because
  `MailboxDescriptor.state === 'unread'` triggers the FLAG_UP_RAD pose in
  `mailbox.ts`.
- Hover tooltip already reads `${unreadCount} unread briefs`.
- Click already routes to `/?sheet=trajectory`. Update if the brief surface
  becomes its own sheet.

**Tests.**

- `vipsWorldMapping.test.ts` — already covers the descriptor shape.
- Add a server-side test once the loader function exists.

### C2. Mood pins ⇄ EmotionPicker captures

**Source.** `EmotionPicker` writes mood selections through the mirror session
flow (`useMirrorSession`). Mood values currently land alongside the reflection.

**Steps.**

- Extend `loadVipsPages` (or add a sibling loader) to also return recent
  emotion captures: `recent_moods: { id, emotion, intensity?, created_at? }[]`.
- In `routes/index.tsx`, pass `recentMoods` into
  `buildVipsWorldSceneModel({ recentMoods })`.
- The Three layer auto-renders pins from `MoodPinDescriptor[]`.
- `hotspotForMoodPin` already routes to `/?sheet=reflections`; consider routing
  to a future `mood` filter.

**Tests.**

- Already covered: `vipsWorldMapping.test.ts` proves bounded ordering
  (newest-first), `moodLimit` truncation, and color mapping.

### C3. (Optional) Real weather feed

**Source.** Browser geolocation + a public weather endpoint, or a server-side
proxy. Out of scope for first pass.

**Steps.**

- Replace the time-of-day-driven `worldWeatherAtElapsed` rain/rainbow with a
  feed-derived signal when the user opts in.
- Keep `useRealTime` toggle as the opt-in surface (already exists in
  `EnvironmentPanel`).

## What stays decorative

- Stars (`sceneEffects/stars.ts`) — pure ambient.
- Ambient fireflies (`sceneEffects/fireflies.ts`) — pure ambient, night-only.
- Aurora, particles, rainbow, rain — already decorative.

## Definition of done

- Mailbox flag visibly responds to a real unread counsellor brief.
- Mood pins appear when the user has captured at least one emotion in the last
  N entries.
- Both connectors are covered by descriptor tests, and the existing scene
  remains nonblank when neither has data.
- No new agent or persistence behavior introduced — all wiring goes through
  read-only server functions.
