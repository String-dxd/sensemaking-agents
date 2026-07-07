# Plan 003: Align onboarding copy with the PDF's voice-first 3-beat framing

> **Executor instructions**: Follow step by step; verify each step. Honor STOP
> conditions. Update this plan's row in `advisor-plans/README.md` when done.
>
> **Read `advisor-plans/000-kira-spec-alignment-brief.md` first** — especially
> Decision 1 (naming) and the voice rules.
>
> **Drift check (run first)**:
> `git diff --stat 4a01fcae..HEAD -- src/engine/student-space/Game/View/Onboarding/copy.js src/engine/student-space/Game/View/Onboarding/copy.d.ts test/components/student-space/onboarding/OnboardingFlow.test.tsx`
> If any changed, reconcile "Current state" against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (copy strings are asserted by a test; wording is product-visible)
- **Depends on**: none
- **Category**: direction / content
- **Planned at**: commit `4a01fcae`, 2026-07-07

## Why this matters

The PDF specifies a deliberately tight, **voice-first** onboarding built to teach
the mechanic and the emotional safety net in three beats:

1. *"Hey. I'm Mei. Tap the mic and tell me what's on your mind — no typing, no
   right answer, no grading. Just talk."* (who + how + permission to be messy)
2. *"Every time you share, a sprout grows in your world. Share three things that
   connect — three things you care about, three choices, three people who matter
   — and that sprout opens into a tree, a flower, wings."* (growth + the unlock
   condition, made concrete)
3. *"Keep talking to me. Over time your world starts to look like you: what you
   care about, how you think, what you're like."* (the payoff — a self-portrait
   from spoken fragments)

The current onboarding copy (`copy.js`) delivers a similar arc but in a different
register: it leads with an **egg/bird-hatching ceremony** (*"Let's hatch your
companion"*) and its explainer is functional rather than voice-first. This plan
brings the **copy** into the PDF's register — voice-first, concrete unlock
condition, self-portrait payoff — **without** ripping out the hatching ceremony
choreography (see "Decision" below).

## Decision: revise copy, keep the ceremony flow (recommended)

There are two ways to hit the PDF:

- **(A) Collapse to literally three screens.** Throw away the egg-color /
  egg-name / hatch / bloom / termly-reveal stages. High churn: deletes built
  camera choreography, the companion-identity ritual, and multiple tested React
  components. Not recommended without explicit product sign-off — the bird
  companion is core to the world's identity, and "three things that connect →
  tree/flower/wings" is exactly what the existing sprout/bloom system does.
- **(B) Keep the flow, revise the copy** *(this plan)*. Update the string values
  in `copy.js` so the greeting and the first-chat explainer speak in the PDF's
  voice-first register and name the unlock condition concretely. Low risk,
  reversible, preserves choreography and tests' structure.

**This plan implements (B).** If the product owner explicitly wants (A), STOP and
raise it as a separate, larger plan — do not partially delete the ceremony.

### Naming (from 000 Decision 1)

Do **not** hardcode "Mei" as the narrator name — "Mei" is already an offline demo
*student* (`OFFLINE_DEMO_STUDENTS` in `copy.js`), and the companion is
user-named. Keep pre-naming narration name-neutral; use `{companionName}` after
the companion is named (the existing `firstChatIntro` already does this).

## Current state

`src/engine/student-space/Game/View/Onboarding/copy.js` — the frozen copy
registry. Relevant current values:

```js
greeting: {
  hello: 'Hi, {name}.',
  sub:   "Let's hatch your companion.",
  hint:  'A bird who lives on your island.',
  cta:   "Let's begin.",
},
kira: {
  firstChatIntro: "Hi. I'm {companionName}.",
  firstChatExplainer: [
    "Each share starts a sprout. I'll ask what it was — a value, interest, a part of you, or a skill.",
    'Three of the same opens it — a tree, a flower, a butterfly, or berries.',
    "I watch what keeps showing up — and tell you. By then this place will look like you.",
  ],
  firstCaptureInvite: "Share something. Words, a voice note, a photo — anything.",
  closing: 'The more you share, the more this island becomes yours.',
  // …other keys unchanged…
},
```

Voice constraints (from the `copy.js` file header): **observation-first, no
exclamation marks, no "Great job!", no unprompted advice, no emoji, ≤ ~80 chars
per Kira line.** These are stricter than the PDF's raw copy — respect the repo's
constraints (e.g. keep lines ≤ ~80 chars; drop the PDF's exclamation in "Hey.").

- `copy.d.ts` — ambient types that must mirror the object **shape exactly**.
  Changing string **values** is safe; **do not add, remove, or rename keys** or
  you must update `copy.d.ts` in lockstep (and that widens scope).
- `test/components/student-space/onboarding/OnboardingFlow.test.tsx` — asserts
  onboarding behavior and may assert specific copy substrings. Run it after edits
  (Step 3); if it asserts a string you changed, update the assertion to the new
  copy **only if** the test is checking presence of that beat, not a
  behavior — see STOP conditions.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Onboarding test | `pnpm test -- OnboardingFlow` | pass |
| Full test | `pnpm test` | all pass |

## Scope

**In scope:**
- `src/engine/student-space/Game/View/Onboarding/copy.js` — string **values**
  only (greeting + `kira.firstChatIntro` / `firstChatExplainer` /
  `firstCaptureInvite` / `closing`).
- `test/components/student-space/onboarding/OnboardingFlow.test.tsx` — only if an
  assertion checks a copy substring you changed (update to match, don't weaken
  behavior assertions).

**Out of scope (do NOT touch):**
- Any **key** in the copy object (would desync `copy.d.ts`).
- `copy.d.ts` (no shape change).
- The onboarding React components / stages / camera choreography
  (`OnboardingFlow.tsx`, `FirstChat.tsx`, `EggHatcher.tsx`, etc.) — this is a
  copy-only plan.
- `OFFLINE_DEMO_STUDENTS`, `EGG_COLORS`.

## Git workflow

- Branch: `advisor/003-onboarding-copy`
- Commit style: conventional commits, e.g.
  `feat(onboarding): voice-first copy aligned to Kira spec`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Revise the greeting + first-chat explainer copy

Edit **values only** in `copy.js`. Target register: voice-first, concrete unlock
condition, self-portrait payoff. Keep every line ≤ ~80 chars, no exclamation
marks, no emoji. Suggested rewrites (tune wording, keep intent + the three
distinct beats):

- `greeting.sub` → lead with the *invitation to talk*, not the egg. e.g.
  `'Tap the mic and just talk. No typing, no right answer.'`
  (Keep `greeting.hint` for the companion cue, or fold the bird cue into the egg
  step — but do not delete the key.)
- `kira.firstChatExplainer` — keep it a 3-element array (the component iterates
  it), mapped to the PDF's three beats:
  - beat 1 (share → sprout): keep the "each share starts a sprout, I'll ask what
    it was" mechanic.
  - beat 2 (unlock, concrete): name the *"three things that connect"* condition
    with concrete examples — three things you care about, three choices, three
    people — opening into *a tree, a flower, wings*. Align the payoff shapes with
    what the app actually blooms (tree / flower / butterfly / berries): prefer the
    app's real shapes over the PDF's "wings" if they differ.
  - beat 3 (payoff): *"over time this place starts to look like you — what you
    care about, how you think, what you're like."*
- `kira.closing` → keep the self-portrait payoff line.

**Constraint check**: for every string you touch in `kira.*`, confirm length:
`node -e "const {ONBOARDING_COPY}=require('./src/engine/student-space/Game/View/Onboarding/copy.js'); const lines=[ONBOARDING_COPY.kira.firstChatIntro, ...ONBOARDING_COPY.kira.firstChatExplainer, ONBOARDING_COPY.kira.firstCaptureInvite, ONBOARDING_COPY.kira.closing]; const long=lines.filter(l=>l.length>90); if(long.length) throw 'too long: '+JSON.stringify(long); console.log('ok', lines.length,'lines')"`
→ prints `ok …` (uses 90 as a hard ceiling; aim for ~80). If `require` fails
because the module is ESM-only, load it with a tiny dynamic-import script or
inspect lengths by eye against the file — do not skip the length check.

### Step 2: Confirm no keys changed

**Verify**:
`node -e "const {ONBOARDING_COPY}=require('./src/engine/student-space/Game/View/Onboarding/copy.js'); const k=Object.keys(ONBOARDING_COPY.kira).sort().join(','); console.log(k)"`
Compare the key list to the pre-edit list (`git show 4a01fcae:src/engine/student-space/Game/View/Onboarding/copy.js`
→ the `kira:` keys). They must be identical. If a key changed, revert — keys are
out of scope.

### Step 3: Run gates

**Verify**:
- `pnpm check` → exit 0 (proves `copy.d.ts` still matches — shape unchanged).
- `pnpm test -- OnboardingFlow` → pass. If it fails on a changed copy substring,
  read the assertion: if it's checking that a *beat is present*, update the
  expected string to your new copy; if it's asserting *behavior* (a stage
  advances, a CTA fires), do NOT weaken it — STOP and report.
- `pnpm test` → all pass.

## Test plan

- No new test file. The existing `OnboardingFlow.test.tsx` is the guard.
- If it references none of the strings you changed, that's fine — the `pnpm check`
  shape gate plus the length check are your verification.

## Done criteria

ALL must hold:
- [ ] `greeting` + `kira.firstChatExplainer`/`closing` read voice-first and name
      the "three things that connect → tree/flower/…" unlock concretely.
- [ ] No copy **keys** added/removed/renamed (Step 2 key list identical).
- [ ] Every changed `kira.*` line ≤ 90 chars, no `!`, no emoji.
- [ ] `pnpm check` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] Only in-scope files modified.
- [ ] `advisor-plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- Matching the PDF appears to require adding/removing a copy **key** or changing a
  stage (that's option (A) — needs sign-off, out of scope here).
- `OnboardingFlow.test.tsx` asserts a *behavior* that your copy change breaks.
- The payoff shapes the app actually blooms can't be determined — do not invent
  shapes; grep the bloom/sprout code (`BloomCelebrate.tsx`, `IslandReveal.tsx`)
  for the real set and use those words, or leave beat 2's shapes generic.

## Maintenance notes

- If the product later collapses onboarding to the literal 3 screens (option A),
  this copy is the content to carry over — the flow change is separable from the
  wording.
- Keep `copy.js` and `copy.d.ts` in lockstep on **shape**; this plan deliberately
  avoids shape changes so `copy.d.ts` needs no edit.
- The PDF's "no grading, no right answer" permission line is the emotional core —
  if any future copy edit drops it, that's a regression in the spec's intent.
