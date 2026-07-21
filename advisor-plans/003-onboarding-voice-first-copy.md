# Plan 003 (v3): Onboarding script — the bird talks through the spec's 3 screens

> **Executor instructions**: Follow step by step; verify each step. Honor STOP
> conditions. Update this plan's row in `advisor-plans/README.md` when done.
>
> **Read first**: `advisor-plans/000-kira-spec-alignment-brief.md` (Decision 1 —
> naming) and the canonical spec's `# Onboarding dialogue` section in
> `advisor-plans/context/myworld-demo-transcripts.md`.
>
> **Drift check (run first)**:
> `git diff --stat 0e4122b6..HEAD -- src/engine/student-space/Game/View/Onboarding/copy.js src/engine/student-space/Game/View/Onboarding/copy.d.ts src/components/student-space/onboarding/EggHatcher.tsx test/components/student-space/onboarding/OnboardingFlow.test.tsx`
> If any changed, reconcile "Current state" against live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (copy strings are asserted by tests; wording is product-visible)
- **Depends on**: none (001 recommended first so the demo student is Ming Liang)
- **Category**: direction / content
- **Planned at**: commit `0e4122b6`, 2026-07-13 (v3 — deepened after cold-read review)

## Why this matters

After "Use a demo account", onboarding runs: login → greeting → egg
(color/name/hatch) → **first-chat** (the bird speaks through the narrator
panel, one beat per CTA tap) → first-capture → bloom → termly reveal →
closing. The spec scripts exactly what the bird should say, in three screens:

1. *"Hey I'm Mei, thank you for bringing me into your world! Tap the mic and
   tell me what's on your mind. There's no right answer, no grades, or
   expectations. Let's chat."*
2. *"Every time you share something with me, you help your world grow. Share
   things that connect with you. It could be things you care about, choices
   you made, people who matter; and trees, flowers, plants will come to
   life."*
3. *"Over time your world will start to look like you: reflecting what you
   care about, how you think, what you're like. I hope you enjoy your time
   here! I'll let you get started :)"*

This plan maps those screens onto the existing narrator beats (ceremony
choreography kept; **copy values** + one default changed), respecting the
copy registry's constraints (`copy.js` header): observation-first, **no
exclamation marks, no emoji, ≤ ~80 chars per Kira line** (hard gate 90). The
spec's `!` and `:)` are therefore dropped; content and order are preserved.

### Naming (000 Decision 1, revised 2026-07-13)

Maintainer decision: **"Mei" is the bird's default name — editable.** The
spec's "Kira" (transcripts) and "Mei" (onboarding) both stand in for the
companion the student names. Implementation: pre-fill the egg-name input with
`Mei`; the student can overwrite it; all copy keeps `{companionName}`. Never
hardcode "Mei" into a copy string.

## Current state (verified at `0e4122b6`)

### Copy registry — `src/engine/student-space/Game/View/Onboarding/copy.js`

Values this plan changes (others omitted here; the file also has
`firstChatInvite`/`firstChatChatPrompt`/`firstChatChatMore` between intro and
explainer, and `bloomCelebrate`/`termlyReveal` before closing — all untouched):

```js
kira: {
    firstChatIntro:   "Hi. I'm {companionName}.",               // line 59
    firstChatExplainer: [                                        // lines 68-72
        "Each share starts a sprout. I'll ask what it was — a value, interest, a part of you, or a skill.",
        'Three of the same opens it — a tree, a flower, a butterfly, or berries.',
        "I watch what keeps showing up — and tell you. By then this place will look like you.",
    ],
    closing:            'The more you share, the more this island becomes yours.',  // line 78
},
```

`copy.js` is standalone ESM (no imports) — importable by plain node.
`copy.d.ts` mirrors the object **shape**; changing string values is safe;
never add/remove/rename keys.

### Flow mechanics (do not change)

`FirstChat.tsx:215-218` substitutes `{companionName}` via
`.replace('{companionName}', …)` on **`firstChatIntro` only** — explainer
beats are spread raw (line 228), so never put `{companionName}` in an
explainer line. Beats advance by CTA tap through
`engine.view.kiraNarrator.speak(...)`: intro (CTA "Tell me more") → each
explainer beat (CTA "Continue"; final beat CTA = `firstChatActions.feel`
"Start first capture"). `TermlyReveal.tsx` ends with `kira.closing` (CTA
`closing.cta` "Begin").

### Egg-name input — `src/components/student-space/onboarding/EggHatcher.tsx`

```ts
// EggHatcher.tsx:77
const [name, setName] = useState(onboarding?.companionName ?? '')
```

The change target is the `?? ''` fallback (NOT a bare `useState('')` — don't
grep for that). Submit path: `commitName` (lines 110–117) trims and calls
`setCompanionName`/`setIdentity`; empty guard = early return at :111 +
`disabled={!trimmedName}` on the Hatch button (:238); input `maxLength={16}`
(:206), placeholder (:210) only shows when empty. A pre-filled `'Mei'` flows
through unchanged if the student just taps Hatch.

### Tests

`test/components/student-space/onboarding/OnboardingFlow.test.tsx`:
- `:374` asserts the substituted intro `"Hi. I'm Pip."` — must be updated to
  the new intro text.
- Explainer beats are asserted by iterating
  `ONBOARDING_COPY.kira.firstChatExplainer` — no test change needed for beat
  text.
- `:346` types the name with `userEvent.type(input, 'Pip')`. **`userEvent.type`
  APPENDS** — with a `'Mei'` default the value becomes `'MeiPip'` and the
  assertions at `:348–352` (`companionName: 'Pip'`) fail. The test MUST be
  updated to clear first (`await userEvent.clear(input)` before typing).
- No other test or component asserts `firstChatIntro`/`closing` strings
  (verified by grep).

## Target copy (exact strings — use these; all ≤90 chars, no `!`, no emoji)

- `kira.firstChatIntro` →
  `"Hey, I'm {companionName}. Thanks for bringing me into your world."`
  (rendered length varies with the chosen name, `maxLength={16}` keeps it sane)
- `kira.firstChatExplainer` (keep exactly 3 elements):
  1. `"Tap the mic and tell me what's on your mind. No right answer, no grades."`
  2. `"Every share grows your world — what you care about, choices you made, people who matter."`
     (88 chars — fits as-is)
  3. `"Trees and flowers come to life — and this place starts to look like you."`
- `kira.closing` →
  `"I hope you enjoy your time here. I'll let you get started."`
- `greeting`, `eggName.placeholder`, `firstCaptureInvite`, `bloomCelebrate`,
  `termlyReveal` — unchanged.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + lint | `pnpm check` | exit 0 |
| Onboarding test | `pnpm test -- OnboardingFlow` | pass |
| Full test | `pnpm test` | all pass |

## Scope

**In scope:**
- `src/engine/student-space/Game/View/Onboarding/copy.js` — the three `kira.*`
  string values above only.
- `src/components/student-space/onboarding/EggHatcher.tsx` — line 77 fallback
  `?? ''` → `?? 'Mei'`.
- `test/components/student-space/onboarding/OnboardingFlow.test.tsx` — intro
  assertion + `userEvent.clear` before the naming `type`.

**Out of scope (do NOT touch):**
- Any copy **key** (no `copy.d.ts` changes); `OFFLINE_DEMO_STUDENTS`,
  `EGG_COLORS`; stage order / camera choreography / narrator mechanics
  (`OnboardingFlow.tsx`, `FirstChat.tsx`, `WorldInteractions.tsx`); all other
  copy strings.

## Git workflow

Branch `advisor/003-onboarding-script`; commit e.g.
`feat(onboarding): bird speaks the spec's 3-screen script; Mei as editable default name`.
Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Update the three copy values

Edit `copy.js` per "Target copy".
**Verify** (run AFTER the edit — it fails on the pre-edit copy because the old
explainer beat 1 is 97 chars):
`node --input-type=module -e "import('./src/engine/student-space/Game/View/Onboarding/copy.js').then(({ONBOARDING_COPY:c})=>{const lines=[c.kira.firstChatIntro,...c.kira.firstChatExplainer,c.kira.closing]; const bad=lines.filter(l=>l.length>90||/[!]|\p{Emoji_Presentation}/u.test(l)); if(bad.length) throw new Error('bad: '+JSON.stringify(bad)); console.log('ok',lines.length,'lines')})"`
→ `ok 5 lines`.

### Step 2: Default companion name "Mei"

`EggHatcher.tsx:77`: change `useState(onboarding?.companionName ?? '')` →
`useState(onboarding?.companionName ?? 'Mei')`. Nothing else in the component
changes (the input stays editable/clearable; the empty guard stays).

### Step 3: Update the test

In `OnboardingFlow.test.tsx`:
- Intro assertion (`:374`): `"Hi. I'm Pip."` →
  `"Hey, I'm Pip. Thanks for bringing me into your world."`
- Naming flow (`:346`): insert `await userEvent.clear(<the name input>)`
  immediately before `userEvent.type(..., 'Pip')` so the `'Mei'` default is
  removed; the `companionName: 'Pip'` expectations at `:348–352` then stand.
  Optionally add one assertion that the input's initial value is `'Mei'`.

**Verify**: `pnpm test -- OnboardingFlow` → pass.

### Step 4: Shape + full gates

- Key-shape check:
  `node --input-type=module -e "import('./src/engine/student-space/Game/View/Onboarding/copy.js').then(({ONBOARDING_COPY:c})=>console.log(Object.keys(c.kira).sort().join(',')))"`
  → must equal
  `bloomCelebrate,closing,firstCaptureInvite,firstChatChatMore,firstChatChatPrompt,firstChatExplainer,firstChatIntro,firstChatInvite,firstMoodAck,firstMoodPatience,termlyReveal`.
- `pnpm check` → exit 0 (proves `copy.d.ts` shape still matches).
- `pnpm test` → all pass.

## Test plan

No new test file. Guards: the updated `OnboardingFlow.test.tsx` (intro string,
explainer iteration, clear-then-type naming), the Step 1 length/`!`/emoji
check, and the Step 4 key-shape check.

## Done criteria

- [ ] First-chat beats read as the spec's 3 screens in order; intro thanks the
      student for "bringing me into your world".
- [ ] Egg-name input pre-filled "Mei" and editable (test clears + types 'Pip'
      and passes).
- [ ] Step 1 prints `ok 5 lines`; Step 4 key list matches exactly.
- [ ] `pnpm check` and `pnpm test` exit 0.
- [ ] Only in-scope files modified; README status row updated.

## STOP conditions

- Matching the spec appears to require adding/removing a copy key or a stage —
  that's the "collapse to literal 3 screens" option; needs explicit sign-off.
- `EggHatcher.tsx:77` no longer matches the excerpt (drift) — reconcile first.
- A test asserts *behavior* (stage advance, CTA firing) that the copy change
  breaks — report, don't weaken.

## Maintenance notes

- The spec's exclamation marks / ":)" were dropped deliberately per the copy
  registry's voice constraints — if the product owner wants the spec's
  punctuation verbatim, change the constraint in `copy.js`'s header comment
  and re-review all strings; don't make a silent exception.
- `{companionName}` substitution only works in `firstChatIntro`
  (`FirstChat.tsx:215-218`) — adding it to any other string renders the
  placeholder literally.
- If onboarding is ever collapsed to literally 3 screens, this copy carries
  over; the flow change is separable.
