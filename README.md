# Sensemaking Agents

Sensemaking Agents is a student reflection app for turning lived school experiences into a reviewable VIPS library: Values, Interests, Personality, Skills, and Trajectory.

Current product shape:

- `/reflect` is the recording surface: audio-only reflection, one primary voice action, then Mirror saves the raw thought into Library.
- Mirror transcribes audio, reflects the transcript, infers a context tag, and saves the raw thought without waiting on Connector.
- Connector runs from the Library `Run Connector` action or the scheduled evening pass, verifies proposed VIPS links, and applies verifier-passing links directly into the VIPS pages and timeline.
- `/library` is the main review surface. By default it shows all recorded thoughts and VIPS pages; the `Need review` filter shows raw mirror thoughts that still need confirm/forget.
- Cartographer runs manually from `/library` and generates the Trajectory page.
- `/reflect/review` is now a compatibility redirect into `/library?filter=need-review`.

For the latest planning and merge status, see `plans/CURRENT_STATE.md`.

## Architecture

- Frontend: TanStack Router/Start, React, Tailwind, shadcn-style local primitives, Base UI for accessible dialogs/drawers/radio groups.
- Agents: Anthropic Managed Agents for Mirror, Connector, Cartographer, and the self-critique eval/safety reviewer.
- Transcription: OpenAI Whisper via the `openai` package.
- Persistence: Postgres via Drizzle ORM and `pg`; every request is scoped through the `withStudent` tenancy envelope.
- Auth: WorkOS AuthKit with Google sign-in, plus a local demo/dev bypass path.
- Deployment target: Vercel.

## Managed Agent Pipeline

The app uses three product-facing managed agents plus one eval/safety reviewer. Each agent has a narrow job, and the boundary between them is explicit in code.

### Mirror

Mirror runs immediately after recording and transcription.

1. The user records a thought.
2. The app transcribes the audio.
3. The app infers a context tag from the transcript: `school`, `family`, `peer`, `hobby`, or `civic`.
4. Mirror receives the transcript and returns `validation`, `inferred_meaning`, and `story_reframe`.
5. `persistMirror` writes the raw thought to `mirror_entries`.
6. The raw thought starts in `pending` review state so the user can later `Confirm` or `Forget` it in Library.

Default managed-agent model from `scripts/managed-agents/provision.ts`: `claude-sonnet-4-6`.

Mirror creates the dot in the wiki: the student's recorded thought.

### Connector

Connector runs from a deliberate trigger: the Library `Run Connector` action for the active student, or the daily scheduled pass at 18:00 Singapore time (`0 10 * * *` UTC on Vercel Cron).

1. Connector receives recent unconnected mirror entries, existing VIPS pages, and non-forgotten VIPS timeline context.
2. Connector proposes per-dimension VIPS updates across Values, Interests, Personality, and Skills.
3. The deterministic verifier checks proposed entries before anything reaches the wiki tables, including canonical taxonomy membership.
4. Verifier-passing `admitted` and `downgraded` entries are inserted into `vips_timeline_entries`.
5. Touched VIPS page summaries are upserted from the Connector rewrite after safety checks.
6. Dropped entries are preserved only in the confirmed audit row in `vips_proposed_diffs`; they are not shown as user work.

Default managed-agent model from `scripts/managed-agents/provision.ts`: `claude-sonnet-4-6`.

Connector links dots into the mesh. The user does not confirm Connector links; the agent proposes them and the verifier gates them.

### Cartographer

Cartographer runs only when the user clicks `Run sense-making` in Library.

1. Cartographer reads the current VIPS pages and verified timeline.
2. It synthesizes a Trajectory page with a trajectory paragraph, 2-5 pathways, open questions, and a disclaimer.
3. On success, the app navigates to `/library/trajectory`.

Default managed-agent model from `scripts/managed-agents/provision.ts`: `claude-sonnet-4-6`.

Cartographer reads the connected mesh and turns it into a direction-of-travel view.

### Self-Critique Eval/Safety

Self-critique is the managed eval agent for reviewing other agents' outputs. It does not create student-facing meaning or write VIPS state.

1. It reviews Mirror, Connector, or Cartographer drafts against evidence grounding, taxonomy fit, safety, student agency, specificity, sycophancy, and actionability.
2. It returns a pass / pass-with-warnings / fail style critique with risk level, findings, and recommendations.
3. It is allowed to flag safety and overclaiming even when the caller asked for a narrower evidence or specificity review.

Default managed-agent model from `scripts/managed-agents/provision.ts`: `claude-haiku-4-5`.

Self-critique is the guardrail lens: it evaluates quality and safety, while the application still owns persistence and final enforcement.

### Developer Debug Surface

In development builds, the header includes an `agent debug` drawer that shows the current tab's last known Mirror, Connector, and Cartographer state: `idle`, `running`, `succeeded`, `queued`, `skipped`, or `failed`, with a short detail message and timestamp. This is developer-only and is not rendered in production builds.

## Setup

Requires Node 22+, pnpm, Postgres/Neon connection details, Anthropic Managed Agent bindings, and an OpenAI API key for transcription.

Create `.env` with the environment variables your flow needs:

```bash
DATABASE_URL=...
OPENAI_API_KEY=...

MANAGED_AGENT_ENV_ID=...
MANAGED_AGENT_MIRROR_ID=...
MANAGED_AGENT_CONNECTOR_ID=...
MANAGED_AGENT_CARTOGRAPHER_ID=...
MANAGED_AGENT_SELF_CRITIQUE_ID=...

WORKOS_CLIENT_ID=...
WORKOS_API_KEY=...
WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback
WORKOS_COOKIE_PASSWORD=...

CRON_SECRET=...
```

For local browser development without WorkOS, start the app and choose
`profile` -> `use demo account`. That creates a same-origin demo session cookie
for the seeded `demo-a` student.

For non-browser server checks that cannot set the demo cookie, you can use the
dev-only bypass instead:

```bash
DEV_BYPASS_AUTH=demo-a
```

Then run:

```bash
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev
```

The dev server runs at `http://localhost:3000`.

After changing managed-agent prompts or model defaults, update existing hosted agent versions with:

```bash
pnpm provision:managed-agents -- --update-existing connector,cartographer
```

Connector now defaults to `claude-sonnet-4-6`; adaptive Haiku/Sonnet routing is a deferred cost optimization.

## Demo Flow

1. Open `/reflect`.
2. Use the voice button.
3. Allow microphone access. No camera or video element is used.
4. Talk for a short reflection, then stop.
5. The app transcribes, runs Mirror, and saves the raw thought.
6. Review raw thoughts at `/library?filter=need-review`.
7. Open `/library` to run Connector, inspect VIPS pages, and run Cartographer for Trajectory.

## Quality Gates

```bash
pnpm check
pnpm test
pnpm build
```

Useful focused commands:

```bash
pnpm smoke:managed-mirror
pnpm smoke:managed-connector
pnpm smoke:managed-cartographer
pnpm ablate:mirror
pnpm ablate:sensemake
```

## Layout

```text
src/
  agents/       Managed Agent prompts, schemas, runner, context builders
  auth/         WorkOS, demo auth, identity helpers
  components/   World Studio, review, library, and UI primitives
  data/         VIPS and ECG taxonomy fixtures
  db/           Drizzle schema, migrations, queries, seed
  routes/       TanStack Router file routes and API routes
  server/       Server function wrappers and handlers
test/           Vitest specs and ablation fixtures/reports
plans/          Planning artifacts and current state snapshot
```

## Historical Plans

Older plans remain in `plans/` for context, but several are superseded. Use `plans/CURRENT_STATE.md` as the entry point before executing old plan units.
