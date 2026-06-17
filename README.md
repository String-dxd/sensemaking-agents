# SenseMake

SenseMake is a student reflection app for turning lived school experiences into a reviewable VIPS library: Values, Interests, Personality, Skills, and Trajectory.

Current product shape:

- `/` is the recording surface: audio-only reflection in the island world, one primary voice action, then Mirror saves the raw thought into Library.
- Mirror uses OpenAI Realtime to listen, transcribe, and reflect the thought, then saves the raw thought without waiting on Connector.
- Connector runs from the Library `Run Connector` action or the scheduled evening pass, verifies proposed VIPS links, and applies verifier-passing links directly into the VIPS pages and timeline.
- `/library` is the main review surface. By default it shows all recorded thoughts and VIPS pages; the `Need review` filter shows raw mirror thoughts that still need confirm/forget.
- Cartographer runs manually from `/library` and generates the Trajectory page.
- `/reflect` redirects to `/`; `/reflect/review` redirects into `/library?filter=need-review`.

For the latest planning and merge status, see `plans/CURRENT_STATE.md`.

## Architecture

- Frontend: TanStack Router/Start, React, Tailwind, shadcn-style local primitives, Base UI for accessible dialogs/drawers/radio groups.
- Agents: OpenAI Realtime for Mirror; Anthropic Managed Agents for Connector, Cartographer, and the self-critique eval/safety reviewer.
- Transcription: OpenAI Realtime input transcription on the main Student Space voice path; the OpenAI transcription helper remains for legacy/support utilities.
- Persistence: Postgres via Drizzle ORM and `pg`; every request is scoped through the `withStudent` tenancy envelope.
- Auth: WorkOS AuthKit with Google sign-in, plus a local demo/dev bypass path.
- Deployment target: Vercel.

## Agent Architecture

The app uses three product-facing agents plus one eval/safety reviewer. Mirror is an OpenAI Realtime agent; Connector, Cartographer, and self-critique are Claude-backed managed agents. Persistence, verification, auth, and final policy decisions stay in application code.

| Agent | Role | Trigger | Writes student-facing state? | Default model |
|---|---|---|---|---|
| Mirror | Reflect one recorded thought back to the student | During Student Space voice/typed capture | Indirectly: app persists its parsed output as a raw mirror entry | `gpt-realtime-2` via `OPENAI_REALTIME_MIRROR_MODEL` |
| Connector | Link recent mirror entries into canonical VIPS pages | Manual `Run Connector` button or 18:00 Singapore scheduled pass | Yes, but only after deterministic verifier gates proposed links | `claude-sonnet-4-6` |
| Cartographer | Synthesize verified VIPS state into Trajectory | Manual `Run sense-making` button | Yes, writes the trajectory view | `claude-sonnet-4-6` |
| self_critique | Eval/safety reviewer for other agent outputs | Best-effort review after Mirror, Connector, or Cartographer drafts | No | `claude-haiku-4-5` |

Realtime Mirror defaults live in `src/agents/openai-realtime/config.ts`. Claude managed-agent provisioning for Connector, Cartographer, and self-critique lives in `scripts/managed-agents/provision.ts`.

### Handoff Flow

1. The user records in the Student Space scene on `/`.
2. The browser opens a server-brokered OpenAI Realtime WebRTC session; the standard OpenAI API key never reaches the browser.
3. The app infers a closed context tag: `school`, `family`, `peer`, `hobby`, or `civic`.
4. Mirror receives the live audio/typed transcript and returns `validation`, `inferred_meaning`, and `story_reframe`.
5. `self_critique` reviews the Mirror draft for evidence grounding, safety, student agency, and specificity. This review is returned as `eval_review`; it does not block persistence.
6. `persistMirror` writes the raw thought to `mirror_entries` in `pending` review state.
7. Connector later runs from Library or the scheduled pass over recent unconnected reflections.
8. Connector proposes VIPS timeline links and page rewrites across Values, Interests, Personality, and Skills.
9. `self_critique` reviews the Connector draft for evidence grounding, taxonomy fit, safety, specificity, and sycophancy.
10. The deterministic verifier gates every proposed timeline link before anything enters `vips_timeline_entries`.
11. Verifier-passing `admitted` and `downgraded` entries become connected VIPS links. Dropped entries stay only in the audit payload in `vips_proposed_diffs`.
12. Cartographer reads verified VIPS pages and timeline entries when the user clicks `Run sense-making`.
13. `self_critique` reviews the Cartographer draft for evidence grounding, safety, student agency, specificity, sycophancy, and actionability.
14. Cartographer writes `/library/trajectory` with a trajectory paragraph, 2-5 pathways, open questions, and a disclaimer.

### Agent Boundaries

Mirror creates the dot. It reflects one transcript without deciding a student identity, career path, or VIPS profile. It should stay validating, concrete, and non-diagnostic.

Connector links dots into the mesh. It can propose VIPS claims only from observed evidence and the closed VIPS taxonomy. It does not invent free-text labels from external lists. The deterministic verifier is the hard gate before links are applied.

Cartographer reads the connected mesh. It synthesizes direction-of-travel from verified VIPS state without inventing certainty, destiny, or prescriptive career advice.

`self_critique` is the guardrail lens. It evaluates quality and safety, but it does not rewrite the full draft, create student-facing meaning, or persist state. It can flag safety and overclaiming even when the caller requested a narrower focus.

### Eval Review Contract

`self_critique` receives:

- `agent`: `mirror`, `connector`, or `cartographer`
- `draft`: JSON-serialized output from that agent
- `focus`: review dimensions such as `evidence_grounding`, `taxonomy_fit`, `safety`, `student_agency`, `specificity`, `sycophancy`, or `actionability`
- `source_context`: compact context such as transcript text, reflection metadata, VIPS page count, or verified timeline count

It returns structured JSON with:

- `verdict`: `pass`, `pass_with_warnings`, or `fail`
- `risk_level`: `low`, `medium`, or `high`
- `critique`: one concise paragraph
- `findings`: categorized issues and recommendations
- `suggestions`: concrete follow-up checks or revisions
- `confidence`: `low`, `medium`, or `high`

The eval call is best-effort. If the `self_critique` binding is missing or the managed-agent call fails, the app logs a warning and continues. Connector safety does not depend on eval alone; verified persistence still depends on deterministic checks.

### Source Of Truth

- Agent prompts: `src/agents/mirror.prompt.md`, `src/agents/connector.prompt.md`, `src/agents/cartographer.prompt.md`, `src/agents/self_critique.prompt.md`
- Realtime Mirror runtime: `src/agents/openai-realtime/*`, `src/server/openai-realtime-mirror-session.handler.server.ts`, `src/lib/student-space/realtime-mirror-client.ts`
- Managed-agent binding and version lookup: `src/agents/config.ts`
- Managed-agent transport: `src/agents/runner.ts`
- Eval runner: `src/agents/self-critique-eval.ts`
- Agent and eval schemas: `src/agents/schemas.ts`, `src/agents/tools/schemas.ts`
- VIPS taxonomy grounding: `docs/vips-taxonomy.md`, `src/data/vips-taxonomy.ts`, `src/agents/context/index.ts`
- Deterministic Connector verifier: `src/agents/verifier.ts`
- Runtime handoff handlers: `src/server/run-mirror.handler.server.ts`, `src/server/auto-connector.handler.server.ts`, `src/server/run-connector.handler.server.ts`, `src/server/run-cartographer.handler.server.ts`

### Developer Debug Surface

In development builds, the header includes an `agent debug` drawer that shows the current tab's last known Mirror, Connector, and Cartographer state: `idle`, `running`, `succeeded`, `queued`, `skipped`, or `failed`, with a short detail message and timestamp. This is developer-only and is not rendered in production builds.

## Setup

Requires Node 22+, pnpm, Postgres/Neon connection details, Anthropic Managed Agent bindings for Connector/Cartographer/self-critique, and an OpenAI API key for Mirror Realtime.

Create `.env` with the environment variables your flow needs:

```bash
DATABASE_URL=...
OPENAI_API_KEY=...
OPENAI_REALTIME_MIRROR_MODEL=gpt-realtime-2

MANAGED_AGENT_ENV_ID=...
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

1. Open `/`.
2. Use the voice button.
3. Allow microphone access. No camera or video element is used.
4. Talk for a short reflection, then stop.
5. Realtime Mirror prepares Kira's reading; choose `Log` to save it or `Forget` to discard it.
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
pnpm smoke:mirror
pnpm smoke:managed-connector
pnpm smoke:managed-cartographer
pnpm ablate:mirror
pnpm ablate:sensemake
```

## Layout

```text
src/
  agents/       Realtime Mirror/Managed Agent prompts, schemas, runner, context builders
  auth/         WorkOS, demo auth, identity helpers
  components/   World Studio, review, library, and UI primitives
  data/         VIPS and ECG taxonomy fixtures
  db/           Drizzle schema, migrations, queries, seed
  routes/       TanStack Router file routes and API routes
  server/       Server function wrappers and handlers
test/           Vitest specs and ablation fixtures/reports
plans/          Planning artifacts and current state snapshot
island-editor/  Standalone island shape designer — isolated pnpm root (r3f + drei)
bird-builder/   Standalone bird dress-up studio — isolated pnpm root (r3f + drei)
```

## Historical Plans

Older plans remain in `plans/` for context, but several are superseded. Use `plans/CURRENT_STATE.md` as the entry point before executing old plan units.
