---
title: Mobbin reference brief — surface-family benchmarks
type: audit
status: active
date: 2026-05-20
related_plan: docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md
---

# Mobbin reference brief — 2026-05-20

External-app reference patterns gathered via Mobbin MCP (`mcp__mobbin__search_screens`), used as **benchmarks, not copy targets**, for the E2E UX/motion audit. Each family lists 2–3 production examples and the specific detail to weigh against the sensemaking-agents counterpart.

---

## 1. Guided first-run with companion — Onboarding / FirstChat

| App | Screen | Detail to benchmark |
|---|---|---|
| **Tolan** ([screen](https://mobbin.com/screens/87dcfb12-8ba2-4ad5-8173-11d42c0d7e13)) | 3D companion mid-greeting against atmospheric horizon, captioned speech in dark capsule pinned bottom | Companion is **rendered in-scene** with the same depth/light as world, not floating on neutral page. Speech sits at thumb height so the world stays uncovered. |
| **Gentler Streak** ([screen](https://mobbin.com/screens/54387efd-46b1-44aa-aebc-cbd0feb9651d)) | "You're almost in" preamble + character standing in stylised scene + single CTA | Pre-land copy explicitly **sets expectation of arrival**. Character only appears once world has loaded — no flash. |
| **Duolingo** ([screen](https://mobbin.com/screens/b8a54efb-c06d-4818-b56e-968b2309c88b)) | Companion with grounding shadow + tail-anchored speech bubble + bottom-pinned CTA | Bubble tail is **anchored to the bird's beak**, not floating. Bird has soft shadow grounding it to the surface. |

**Take-away for U2/U6:** Kira's pre-land flash breaks the rule both Tolan and Gentler Streak honour — never let the companion render before its arrival animation begins. Kira's speech bubble during FirstChat could also borrow Duolingo's tail-anchor for clearer attribution.

---

## 2. Reflection mood capture — MoodSheet / AskSheet

| App | Screen | Detail to benchmark |
|---|---|---|
| **How We Feel** ([screen](https://mobbin.com/screens/8e572966-a4ad-430b-853c-60b1641236b7)) | 2×2 colour-quadrant picker (Energy × Pleasantness) on near-black background | **One-question, one-tap** model. No scroll, no second screen for the headline emotion. Soft inner-glow on each tile gives it tactile weight. |
| **Ahead** ([screen](https://mobbin.com/screens/3bb8bc70-13f5-4e69-a99a-94dd25e17bda)) | Colour-dot row → free-form thought field → "All done" sticky CTA | Capture is **single-screen end-to-end** (mood pick + optional thought + submit). Selected dot scales up — implicit confirmation, no toast. |
| **Fitbit** ([screen](https://mobbin.com/screens/17d2479f-0e07-463c-8f43-d216063d8340)) | Emoji-labeled radio list + timestamp + "Edit" affordance + bottom CTA | Each option has its own **glyph + label**, not glyph-only. Timestamp is editable inline. CTA stays disabled until selection. |

**Take-away for U6:** Sensemaking's MoodSheet is closest to Ahead in spirit. The thing to copy is **selection-confirms-implicitly** (scale-up + colour bloom on the picked option), not the Tangerine-style toast layer.

---

## 3. Translucent sheet over animated background — Full-viewport sheets

| App | Screen | Detail to benchmark |
|---|---|---|
| **Flighty** ([screen](https://mobbin.com/screens/11cbe662-2840-4c56-9bd6-8c62b32acade)) | "Weather Layers" bottom sheet over animated 3D globe; sheet is **frosted glass with content reading clearly**; globe stays alive behind | Sheet uses ~0.85 white + heavy backdrop blur. Globe rotation visible through it — confirms "world keeps living." Nested rows use rgba 0.6 background — **lower alpha than the sheet itself**. |
| **Bump** ([screen](https://mobbin.com/screens/7ee83c69-8211-472d-9ed3-edbc4217eeba)) | Globe scene at full bleed with floating capsule labels orbiting + bottom info-pill | Labels sit on glass capsules with **circular avatar protruding past the pill edge** — gives it dimensionality. The globe is the protagonist; chrome is whisper-thin. |
| **Moonlitt** ([screen](https://mobbin.com/screens/edad16c0-6b7c-41a5-8126-9bee3a36d02c)) | Frosted "Layers" panel docked top-right over animated map; bottom-pill carries primary info | Panel uses **rounded-corner glass with a soft outer ring**, not a hard border. Layer thumbs inside are concentric-radius. |

**Take-away for U4/U5/U6:** Flighty is the closest cousin to sensemaking's full-viewport sheets and proves the rule: **nested cards inside a translucent sheet must be lower-alpha than the sheet itself**, otherwise the scene reads as broken. Confirms U4 (Profile hero 0.85→0.35) and U5 (Path Finder 0.72→0.40) are directionally right.

---

## 4. Calendar with affective markers — CalendarSheet

| App | Screen | Detail to benchmark |
|---|---|---|
| **Apple Health — State of Mind** ([screen](https://mobbin.com/screens/3ce3ce8f-a9ab-4a3d-b3e0-77979d24d235)) | Monthly grid; each logged day shows a unique **flower glyph in the day's chosen colour**; empty days show a thin ring | Glyph is the day's voice — colour + shape encode two dimensions. Today is a filled circle with white text. Grid lines absent — spacing carries the rhythm. |
| **How We Feel** ([screen](https://mobbin.com/screens/9145bba7-7d63-41d6-961a-0d91703865c5)) | Dark-mode monthly column grid; each logged day shows a **cluster of small emoji-glyphs** stacked above the date | Multi-emotion days render as a cluster (not one chosen tone). Tab title above ("All the emotions you felt") frames the artifact. |
| **Stoic** ([screen](https://mobbin.com/screens/3fe60292-97c3-4597-86fd-7f6a5b1ab2ab)) | "One dot = one day" minimalist grid; each day is a circle whose **size + colour intensity** encode mood; month labels on the right | A whole **year on one screen** by collapsing the day to a single dot. Density patterns become visible. |

**Take-away for U6:** Calendar in sensemaking is structurally closest to Apple Health. Two things to steal: (a) replace the round bordered cells we currently use with **negative-space-as-rhythm** (drop grid lines, let spacing carry it), (b) give logged days a per-day glyph in the day's facet colour rather than the current generic dot.

---

## 5. Letters / messages inbox — LettersSheet

| App | Screen | Detail to benchmark |
|---|---|---|
| **Apple Messages** ([screen](https://mobbin.com/screens/9be46417-6102-4e33-b1f7-4a0f63b28e6f)) | Huge "Messages" title + single row + blue unread dot + Edit/Compose corners | Row is **avatar + sender + 1-line preview + timestamp**, with the entire empty area below feeling intentional. The unread dot is the only colour. |
| **Behance** ([screen](https://mobbin.com/screens/b0637aff-78b8-4982-98d7-6620237bb59a)) | Inbox with swipe-to-archive on each row + corner compose FAB | Swipe action reveals a coloured panel with one word ("Archive"), not a multi-button kebab. Light loader appears when refreshing without blocking the list. |
| **Tesla** ([screen](https://mobbin.com/screens/9a652eec-f653-4bcd-8c89-88ba024b9633)) | System-message inbox: small monochrome icon glyph + bold title + 2-line preview + right-aligned date | Each system-sender row has its **own glyph in a soft tile** — distinguishes notification type without colour. Dates are right-aligned with consistent abbreviation. |

**Take-away for U6:** LettersSheet today is closer to Tesla in spirit (system-authored). The detail to import is Apple Messages' **negative-space-as-content** posture — the empty zone below the list is part of the design, not a void to fill with placeholder UI.

---

## 6. Decision / pathway viewer — TrajectorySheet (Path Finder)

| App | Screen | Detail to benchmark |
|---|---|---|
| **Brightmind** ([screen](https://mobbin.com/screens/a6c847eb-640b-44fb-be99-df1f98b40c69)) | "Guided / Un-Guided" tabs over a **dotted spline path** with numbered checkpoint circles; current step bright, future steps muted | Path is the metaphor: literally a curving spline you walk along. Tab pair at top gates two modes without leaving the view. |
| **Mimo** ([screen](https://mobbin.com/screens/c3dbfb2e-3514-44f1-9f42-c8fac8c205f0)) | Project node card + **connector lines down to next node** + locked node downstream + bottom tab nav | Locked/unlocked state shows up in the node itself (lock icon + dimmed surface), connector lines visually advance the journey. |
| **Duolingo** ([screen](https://mobbin.com/screens/6d3327c2-0111-405c-a5db-9ff4f163f077)) | Vertical zig-zag of node buttons + companion idling beside the active node + section banner above | Companion **gestures toward the current step** — it's interpretation, not decoration. Inactive nodes lose colour and elevation; active node carries the only saturated glyph. |

**Take-away for U6:** TrajectorySheet today is closer to a horizontal status-pill carousel than to any of these path-shaped metaphors. Two things to steal without redoing the IA: (a) Brightmind's **muted-vs-current contrast** is the right vocabulary for differentiating realised vs aspirational paths; (b) Duolingo's idea that the **state pill should anchor visually to the active path-card** (tail/connector) — current implementation lets it float untethered.

---

## Coverage notes

- All 6 families returned multiple production examples on `ios` deep-search. No family fell back to "no good match."
- References stay **read-only artefacts** for the audit phase. Any visual change in U6 must be motivated by sensemaking's own product logic, not "looks like Mobbin app X."
- This brief is committed to the repo so PHASE 3 (`audit-findings.md`) can cite IDs without re-fetching.
