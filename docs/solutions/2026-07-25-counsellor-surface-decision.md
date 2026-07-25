---
date: 2026-07-25
topic: counsellor-surface-decision
tags: [decision, counsellor, privacy, share-token, r22, vips, cartographer]
status: awaiting-maintainer-decision
---

# Decision: the counsellor surface — build it, defer it, or delete the brief pipeline

## What this is

`plans/067-counsellor-surface-design.md` asked a product question, not a
coding question: the counsellor-brief pipeline is fully built and tested but
has zero callers, so is it the cheapest high-value surface in the repo or dead
code that should be deleted before it traps the next agent?

This document establishes the facts (every claim below was verified against
the live tree at commit `031d1974`), answers the plan's four open questions,
and states one overall recommendation. **No code was changed.** Plan 067's
Step 2 is an explicit halt for the maintainer's decision, and Steps 3 (BUILD)
and 4 (DELETE) are mutually exclusive branches that were not authorized.

**The single fact that reframes the whole question**: the product already
ships a student-initiated, revocable, quote-redacting way to show an adult
their profile — the share-token lane behind the Share button in
`/profile`. It landed *after* the brief renderer and does most of the same
job better. The brief was not forgotten; it was overtaken.

---

## 1. What exists

### 1.1 The three unwired modules

**`src/server/counsellor-brief.functions.ts`** — two `createServerFn`
endpoints:

- `counsellorBrief` (`:9-14`), whose docblock (`:4-8`) states the client
  contract: the client receives `{ markdown }` and triggers a `Blob`-based
  download; the server never persists or transmits the file, per R22.
- `loadCounsellorBriefStatus` (`:21-26`) — a lightweight status probe.

`grep -rn "counsellorBrief" src --include="*.tsx"` → **no matches**. Neither
exported server function is imported by any component, route, or engine
module. Across `src` and `test`, every reference to the symbol lives inside
the pipeline's own files plus `function-schemas.ts`,
`load-vips-pages.handler.server.ts`, and `db/queries.ts`.

**`src/server/counsellor-brief.handler.server.ts`** — reads the four VIPS
pages, per-dimension non-forgotten timeline entries, and the latest
`cartographer_outputs` row inside one `withStudent` transaction (`:59-104`),
then defers to the pure renderer. Its header (`:10-13`) records the privacy
boundary verbatim:

> R22 boundary: the handler does NOT write the markdown to disk and does NOT
> transmit it anywhere — it returns `{ markdown }` to the client, which
> triggers a `Blob`-based download. The brief is on-demand, student-initiated,
> and not auto-persisted. No row is appended to any table by this call.

The handler resolves its student from the session, not from input:
`const { studentId } = await requireCounselorContext()` (`:58`).

**`src/lib/counsellor-brief-renderer.ts`** — pure, no DB, no fetches. Carries
real safety logic that would be costly to rebuild: the Personality
compiled-truth runs through `checkPersonalityRewriteForDiagnosticLanguage`
and is replaced with `_Personality summary withheld pending review._` when
flagged (`:105-110`); student-authored strings are escaped through
`escapeForMarkdownBlockquote` before entering blockquotes (`:142`). Its scope
note (`:11-13`) is the crux of plan 067:

> Scope per R22 and the U12 Approach: this is a developer/demo debugging
> artifact in v0.2 … No counsellor portal, no per-school styling.

The rendered output repeats that framing in its own footer (`:85`):
`*Developer/demo debugging artifact. Not a versioned brief.*`

### 1.2 Tests

- `test/lib/counsellor-brief-renderer.test.ts` — **12 tests, all passing**
  (verified: `pnpm vitest run test/lib/counsellor-brief-renderer.test.ts` →
  `12 passed (12)`).
- `test/server/counsellor-brief.test.ts` — **does not run**. It is
  `@ts-nocheck` (`:1`) against the legacy `openInMemoryDb` path and gated at
  `:95` by `describe.skipIf(!process.env.DATABASE_URL)`, with a
  `TODO(reza-step2-followup)` to rewrite it against Drizzle/Postgres. So the
  *handler* — the part that touches tenancy and the DB — has no executing
  coverage. Only the pure renderer does.

### 1.3 The "wired" status adapter is a stub, and nothing reads it

Plan 067 describes `loadCounsellorBriefStatusForStudent` as "the only wired
consumer … surfaced by the in-world mailbox." The first half is true; the
second is not, and the maintainer should know before weighing DELETE.

- `src/server/load-vips-pages.handler.server.ts:122` really does call it, and
  `:133` really does put the result on the payload as `world_mailbox` (typed
  at `:56-58`).
- But `loadCounsellorBriefStatusForStudent` returns a **hardcoded**
  `unreadBriefCount: 0` (`counsellor-brief.handler.server.ts:121`); only
  `lastBriefId` is real.
- And **no client code reads `world_mailbox`**. `grep -rn
  "world_mailbox\|worldMailbox" src test` returns exactly four hits: the three
  in the loader above, plus one test fixture
  (`test/lib/student-space/backend-snapshot.test.ts:387`). The engine snapshot
  bridge never maps it.
- The in-world mailbox peek copy reads letters, not briefs:
  `state?.letters?.unreadCount?.()` at
  `src/components/student-space/world/WorldInteractions.tsx:1016` and `:1021`.

So the mailbox indicator is fed by `state.letters`, not by the brief-status
adapter. The adapter is a live *call* on a dead *field*. It costs one extra
`latestCartographerOutput` query per `/profile` load and must survive any
deletion (plan 067's STOP condition), but it is not evidence that the brief
has a home in the world.

### 1.4 The authorization model is the tenancy envelope, not a counsellor portal

Plan 067 reads `counselor_students` + `assertCounselorHasStudent` as "a data
model built for a surface that was never rendered." That overstates it, and
the correction matters for question 1.

- `requireCounselorContext()` (`src/auth/identity.ts:64-90`) is the single
  identity seam used across the app: `grep -rl` finds the symbol in 29 files —
  its definition, `src/routes/_app.tsx`, and **27 server handler modules**,
  i.e. essentially all of them. It is not counsellor-specific.
- A "counselor" principal maps to exactly **one** active student. Real WorkOS
  users get a private, initially empty student namespace
  (`identity.ts:104-111`, `CounselorContext.studentId` doc at `:50-54`).
  Demo/dev sessions get a seeded demo id (`:65-71`, `:80-87`).
- `assertCounselorHasStudent` (`src/db/client.ts:174`) has exactly one
  non-test caller: `identity.ts:111`, guarding that same self-namespace. It is
  the tenancy gate.
- `attachCounselorToDemoStudents` (`client.ts:247`) exists to let one demo
  principal switch between the four seeded demo students — surfaced by the
  demo-student switcher in `SettingsSheet.tsx` (`data-testid="settings-demo-student-*"`).
  That is a presenter affordance, not a roster.
- `findFirstAttachedStudent` (`client.ts:196`) has no callers in `src`.
  `listAttachedStudentIds` (`src/db/queries.ts:529`) has one: the Connector
  cron fan-out (`run-connector.handler.server.ts:144`).

The table is genuinely many-to-many and could support a roster later, but
nothing today models an adult who supervises *other people's* children. The
word "counselor" in this codebase means "the account", not "the school
counsellor".

### 1.5 The surface that *did* ship: the share-token lane

This is the finding that decides the plan. It is not mentioned anywhere in
plan 067.

- `src/server/share-token.handler.server.ts:1-13` — create / revoke /
  set-redactions handlers behind `/api/share/*`. Auth-gated to real WorkOS
  sessions; demo and dev-bypass sessions get `share_demo_unsupported`.
- `src/routes/share.$token.tsx` + `src/components/share/PublicProfilePage.tsx`
  — an unauthenticated public profile page, with
  `RevokedShareCard.tsx` and `OwnerPreviewBanner.tsx`.
- `src/server/load-public-profile.handler.server.ts:11-12` — `show_quotes` is
  "the ONLY redaction switch and is read EXCLUSIVELY from the DB row";
  client-supplied values are ignored. Verbatim quotes become `null` when it is
  off (`:68`, `:134`).
- **It is fully wired to UI.** `ProfileSheet.tsx:318` renders the Share
  button; `:352` and `:1130-1137` mount `ShareDialog` on
  `ShareTokenBridge.js`, which posts to `/api/share/create|revoke|redactions`
  (`ShareTokenBridge.js:17-19`).
- Quote exposure **defaults to off** (`ShareTokenBridge.js:40`,
  `this.showQuotes = false`) and is an explicit toggle in the dialog —
  "Show reflection quotes" (`ProfileSheet.tsx:1301`, `:1312`).
- The link is **revocable** (`ShareTokenBridge.js:137-161`; "Revoke link" at
  `ProfileSheet.tsx:1347`).

Chronology confirms supersession rather than oversight. The brief renderer
landed 2026-05-11 with the original VIPS pivot (`d5873d63`). The share-token
lane landed 2026-05-19 (`a9778754`) and got its UI by 2026-05-22 (`c3125245`).
The adult-facing question was answered eight days after the brief was written,
by a different and better mechanism — and nobody went back to retire the
brief.

### 1.6 What the brief has that the share page does not

One thing, and it is not nothing: **the Cartographer Trajectory**. The public
profile payload (`load-public-profile.handler.server.ts:42-71`) carries name,
`lastSyncedAt`, the four dimensions with compiled truth, open question, claim
count, and optionally-redacted recent entries. It carries **no**
`trajectory_paragraph`, no pathways, no disclaimer — `grep -rn -i
"trajectory\|cartographer"` over the handler and `PublicProfilePage.tsx`
returns only an unrelated `openQuestion` hit. The brief renders all three
(`counsellor-brief-renderer.ts:81-83`, `:146-164`, `:207-215`).

So the overlap is roughly 80%, and the 20% delta — the synthesis an adult
would most want — sits on the wrong side of the wire.

---

## 2. The four open questions

### Q1. Does the student always initiate the share, or can an attached counsellor pull the brief?

**Recommendation: student-initiated, always. Do not add a pull direction.**

Three independent reasons, in ascending order of force:

1. The handler header already declares it (`counsellor-brief.handler.server.ts:12`).
2. The endpoint is structurally *incapable* of a pull today.
   `counsellorBriefInputSchema = z.object({})`
   (`src/server/function-schemas.ts:10`) takes no student selector, and the
   handler derives `studentId` from the session (`:58`). A pull would mean
   accepting a client-supplied student id — which `identity.ts:13-16`
   forbids by design: "This is the seam that makes the activeStudentId
   server-resolved, never client-supplied (plan §6.1)." Adding a pull is not a
   button; it is an amendment to the app's tenancy contract.
3. The subject is a minor and the content is their own unedited speech. A pull
   direction converts a reflective tool into a surveillance-capable one, and
   the moment that is technically possible the product has to answer whether
   the student can see that it happened. That is a consent design problem,
   not a sprint.

The plan's own STOP condition covers the escalation: an authenticated
counsellor *view* across attached students is out of scope and needs its own
plan. Nothing found here argues for opening it.

### Q2. Does the brief include raw reflection quotes, or only the Cartographer synthesis?

**Recommendation: it must be a student-controlled toggle defaulting to
withheld — which today it is not. This is the strongest single argument
against shipping the download as specified.**

The renderer emits up to three verbatim quotes per dimension,
unconditionally: `TOP_K_QUOTES = 3` (`:49`), `renderQuoteLine` (`:141-144`)
formats `> "quote" — strength`, and there is no flag anywhere in
`RenderCounsellorBriefInput` (`:53-66`) to suppress them. Escaping is handled;
*exposure* is not a choice.

Meanwhile the shipped share lane treats exactly this decision as the one
redaction switch that exists, defaults it to **off**
(`ShareTokenBridge.js:40`), and gives the student a labelled toggle
(`ProfileSheet.tsx:1301`). The product has already decided that verbatim
reflections are the sensitive payload and that the default is to withhold
them.

Shipping a Settings button that hands an adult a file containing the top three
verbatim quotes per dimension, with no toggle, would therefore be a
**privacy regression relative to a surface we already shipped** — even though
it satisfies R22 to the letter. R22 constrains the *server*; it says nothing
about what leaves the browser.

If the brief ever ships, it must take the same flag, read from the same
authority, with the same default.

### Q3. Is the artifact a download the student hands over out-of-band, or does the product ever transmit it?

**Recommendation: never transmit — keep R22 exactly as written. But do not
mistake "download" for the safer option; on the downstream axis it is the
riskier one.**

R22 is well-drawn and should not be weakened: no disk write, no server-side
transmission, no row appended (`handler.server.ts:10-13`). Nothing in this
analysis needs it relaxed.

The honest counterpoint is that a downloaded markdown file is **irrevocable
and un-redactable after the fact**. Once a student AirDrops it to a teacher it
exists forever, outside the product, with whatever quotes it contained. The
shipped share link is the opposite: revocable on demand
(`ShareTokenBridge.js:137-161`), and its redaction state is re-read from the
DB on every view (`load-public-profile.handler.server.ts:11-12`, `:114`), so
flipping the toggle retroactively hides the quotes from a link already handed
out.

For a minor's reflections in a school setting, revocability is worth more than
offline convenience. If both exist, the link should be the primary channel and
the download a deliberate, clearly-labelled secondary for printing — with copy
that says plainly that a downloaded file cannot be unshared.

### Q4. Does the in-world mailbox become the shared metaphor for both directions?

**Not decided here — `plans/068-letters-direction-decision.md` owns the
channel question, and it explicitly depends on 067 settling who the adult is.
This document's answer to that dependency is: the adult is whoever the student
hands a revocable link to, and there is no privileged counsellor principal.**

What 067 can contribute to 068 is one corrected fact, from §1.3: the belief
that brief status already feeds the mailbox indicator is false. `world_mailbox`
is computed and returned but read by nothing; `unreadBriefCount` is a hardcoded
`0`; the mailbox peek reads `state.letters`. 068 should treat the mailbox as
an unclaimed metaphor, not a half-built brief inbox.

One caution to carry over: the mailbox metaphor implies delivery *to* the
student from an adult. The brief travels the other way. Overloading one object
with both directions risks making it ambiguous to a 15-year-old exactly who
can see what — which is the one thing this whole surface must never be.

---

## 3. What the "developer/demo debugging artifact" scope note means

**It was a deliberate stopping point that has since been overtaken — and it is
now misleading rather than merely stale.**

Read literally, every clause of the note (`counsellor-brief-renderer.ts:11-13`)
is still true: there is no counsellor portal, there is no per-school styling,
and the markdown really was shaped against a render of the seed. It was not a
TODO someone forgot; U12 shipped a pure renderer so a developer could eyeball
the brief shape, and drew the line there on purpose.

What changed is the context around it. When the note was written (2026-05-11)
there was no adult-facing surface at all, so "no counsellor portal yet" read
as a roadmap gap. Eight days later the share-token lane shipped and answered
that gap a different way. The note now reads like unfinished business when it
actually describes a **superseded** lane — and that misreading is precisely
what generated plan 067's premise that this is "the cheapest high-value
surface in the repo."

The note should be rewritten to say what is true now: this renderer is
intentionally unwired; the shipped adult-facing surface is the share-token
public profile; the renderer is retained for the Trajectory content the share
page lacks and for a possible CLI export. That single edit is what stops the
next agent from rediscovering this.

---

## 4. Overall recommendation

**DEFER — but as a decision, not a shrug. Do not build the download as
specified; do not delete the pipeline; retarget the counsellor need onto the
share-token lane that already ships.**

Three findings drive it:

1. **BUILD as specified would ship a privacy regression.** The renderer emits
   verbatim quotes unconditionally (§Q2). The product's own decided posture,
   in the surface that actually shipped, is quotes-off-by-default plus
   revocation. A Settings button producing an irrevocable file with quotes
   always on is worse than what a student can already do — and it is worse in
   exactly the dimension a Singapore school will ask about.
2. **DELETE would throw away the only asset here.** The renderer holds the
   Personality diagnostic-language guard, the blockquote escaping, and the
   only rendering of the Cartographer Trajectory into a shareable artifact —
   the one thing the public profile lacks (§1.6). Deleting it costs the 12
   green tests and the safety logic to rebuild the same content later; leaving
   it costs one misleading comment, which §3 fixes.
3. **The real gap is on the shipped lane, not this one.** The valuable,
   decision-free next step is to bring the Trajectory (paragraph, top
   pathways, disclaimer) onto the public share profile, behind the token that
   is already revocable and the `show_quotes` flag that already exists. That
   serves the counsellor better than any download: they read it on a phone,
   the student can revoke it after the meeting, and no file escapes.

Concretely, if the maintainer accepts DEFER:

- **Now, in this plan's spirit but not its steps** — rewrite the renderer's
  scope note (`counsellor-brief-renderer.ts:11-13`) to say "intentionally
  unwired; superseded by the share-token lane; retained for Trajectory
  content", and link this document. One comment, no behaviour change.
- **Next plan (not 067)** — add the Trajectory section to
  `load-public-profile.handler.server.ts` + `PublicProfilePage.tsx`, deciding
  whether it sits behind `show_quotes` or its own flag. Reuse the renderer's
  section logic if it ports cleanly.
- **Also worth a line in that plan** — either wire `world_mailbox` to a real
  consumer or drop it from the payload, and either revive or delete the skipped
  `test/server/counsellor-brief.test.ts`. Both are small honesty debts found
  here (§1.2, §1.3).
- **Revisit DELETE** once the Trajectory lives on the share page. At that
  point the renderer's last unique value is gone and deleting it is clean —
  keeping `loadCounsellorBriefStatusForStudent` only if `world_mailbox` has
  by then acquired a reader.

If the maintainer instead wants BUILD, the minimum non-negotiable amendment is
a quote-suppression flag on `RenderCounsellorBriefInput` defaulting to
withheld, plus student-facing copy stating the file cannot be unshared. R22
stays untouched either way.

---

## 5. Maintainer's decision

> _Not yet recorded._ Plan 067 Step 2 halts here for the maintainer. Steps 3
> (BUILD) and 4 (DELETE) were not authorized and were not executed. No source
> file was modified by this plan.
