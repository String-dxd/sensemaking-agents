---
title: VIPS Wiki Pivot — manual smoke test
date: 2026-05-11
branch: feat/vips-wiki-pivot
driver: agent-browser (Chromium 148)
backend: gpt-5.5 live; local SQLite app.db; dev seam `?inject=`
---

# VIPS Wiki Pivot smoke test — 2026-05-11

Live end-to-end smoke driven via `agent-browser`. Voice path bypassed via a dev-only
URL param seam (`/reflect?inject=<transcript>`) added in this session so the F1
pipeline could be exercised without WebRTC / Whisper.

## Verdict: PASS with one fix, one observation

| Flow | Result | Notes |
|------|--------|-------|
| F1.a Cold-start Mirror | ✅ | Dev seam → ContextTypePicker → Mirror (`gpt-5.5`) → auto-Connector → verifier admitted across V/I/S |
| F1.b Confirm + forget mix | ✅ | 3 confirm + 1 forget; Done auto-finalized on last entry; wiki shows confirmed entries |
| F2 Run sense-making | ✅ | Cartographer produced 3 pathways with valid `trait_combination` chips referencing real claim IDs |
| F3 Forget from wiki | ✅ | Inline confirm → `forgotten_at` stamped → `vips_forget_count` incremented → R20 not surfaced in UI |
| F4 Counsellor brief | ✅ | Renderer output verified end-to-end; all 4 sections present + Trajectory + Open questions + Disclaimer |
| F1.c R30 pending-queue | not run | Time-boxed; the pending-queue partial-unique-index is exercised by `test/server/persist-mirror-v0.2.test.ts` |
| F5 Gate-removal dialog | not run | `total_claim_count = 3` after F1.b — equal to threshold, so the dialog branch did not fire. Plan U9 specifies `< 3`. To exercise: forget enough entries to drop below 3, then click Run sense-making |

## Bug found and fixed

**TanStack Router parent-child layout bug.** `reflect.tsx` defined the route at
`/reflect` (rendering MirrorSession) AND was the parent of `reflect.review.tsx`
in the generated route tree (`getParentRoute: () => ReflectRoute`). Because the
parent didn't render an `<Outlet/>`, navigating to `/reflect/review` displayed
the parent's MirrorSession content instead of the post-Mirror review surface.

**Fix:** split `reflect.tsx` into:
- `reflect.tsx` — layout-only, renders just `<Outlet/>`
- `reflect.index.tsx` — leaf route at `/reflect/` rendering MirrorSession

Routes confirmed working after the split: `/reflect` shows MirrorSession,
`/reflect/review` shows PostMirrorReview.

## Observation (not a bug, worth noting)

**Compiled-truth persists after the last timeline entry in a dimension is forgotten.**
After F3 (forgetting the single Skills entry), `/wiki` still shows the Values-style
compiled-truth paragraph for Skills with "0 claims updated 5/11/2026". This is
correct per R2 design (compiled-truth is a derivative summary, not the canonical
data — the timeline is canonical), but the UI surface could clarify it: maybe
dim or replace the paragraph with the empty-state copy when `claim_count === 0`.

## Captured artifacts

Screenshots under `docs/smoke-tests/`:

- `01-wiki-baseline.png` — empty 4-card overview, "0 claims"
- `02-reflect-injected.png` — picker with default `school` selected
- `05-review-surface.png` — VERIFIED ✓ badge, `values.contribution` claim ID, verbatim quote
- `07-wiki-after-confirm.png` — Values/Interests/Skills each at "1 claim" with populated compiled-truth
- `08-trajectory.png` — 3 pathways with clickable trait-combination chips
- `09-wiki-skills.png` — Skills dimension page, 1 timeline entry
- `10-wiki-skills-forget-confirm.png` — inline Forget+Cancel confirm pair
- `11-wiki-skills-after-forget.png` — empty timeline; back-to-wiki link

## Sample artifacts (real LLM output, captured live)

**Connector compiled-truth for Values** (from the review surface):

> Early evidence suggests the student notices meaning when their effort helps
> others in a school setting, especially in a role supporting younger students.
>
> **Open question:** Is the sense of usefulness tied mainly to helping others
> adjust, or to being trusted with responsibility?

**Verifier-admitted verbatim quote** (matched against the injected transcript
via normalized-substring; tagged `values.contribution`, strength=medium):

> "i felt useful in a way that doesn't always happen in class"

**Cartographer pathways** (3 emitted, all 3 admitted by the post-process validator):

1. **Peer mentoring and junior-guiding roles** — `values.contribution` + `interests.social` + `skills.leadership`
2. **School leadership with a service focus** — `values.contribution` + `skills.leadership`
3. **Peer support and wellbeing-style roles** — `values.contribution` + `interests.social`

**Counsellor brief head** (first ~600 chars of the markdown):

```markdown
# Counsellor Brief — demo — 2026-05-11

## Values

Early evidence suggests the student notices meaning when their effort helps
others in a school setting, especially in a role supporting younger students.

> "i felt useful in a way that doesn't always happen in class" — medium strength

## Interests

The student shows some draw toward people-facing school roles: leading an
orientation group, helping juniors feel at ease, and noticing whether the
group is enjoying itself.

> "today i led the orientation group for the new sec 1 cohort" — medium strength

## Personality

_No compiled summary yet._
```

## Tooling notes

- `agent-browser`'s native `click @eN` did NOT reliably fire React `onClick`
  handlers for the picker buttons (role="radio") or the confirm/forget buttons.
  `eval('button.click()')` worked every time. Recommend wrapping eval-click in
  a small helper for future smoke runs.
- Server-fn direct invocation via `curl` returned 500 (URL routing fingerprint
  mismatch). Use the page's bundled module imports instead (`import('/src/server/...')`).

## What this smoke does NOT cover

- F1.c (R30 pending-queue): unit-tested in `test/server/persist-mirror-v0.2.test.ts`
- Gate-removal confirm dialog: needs a `claim_count < 3` setup; trivial to drive
  in a follow-up by starting fresh seed or forgetting more entries
- Whisper transcription path: bypassed by design (the dev seam exists precisely
  to skip it). Whisper itself is unchanged in this PR
- Voice-mic permission UX: out of scope for this PR (carries forward from v0.1)
- Multi-student / cross-tenant isolation in the UI: hardcoded `STUDENT_ID = 'demo'`
  in routes per Known Residual F#13
