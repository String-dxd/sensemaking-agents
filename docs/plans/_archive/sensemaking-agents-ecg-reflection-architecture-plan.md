# sensemaking-agents: Student ECG Reflection and Multi-Agent Architecture Plan

Codename: **sensemaking-agents**

One-line pitch: **sensemaking-agents helps secondary students turn everyday class, CCA, and school experiences into self-understanding, so ECG choices are grounded in lived evidence rather than abstract advice.**

## Product Judgment

This should not be another study assistant, career recommender, or personality quiz.

The stronger product is a **school reflection and sensemaking system**: students speak freely after meaningful experiences, agents detect patterns over time, and human guides are brought in when their support is useful or necessary.

The product must be honest about care boundaries. It is not a fully private journal. It is **student-owned reflection with explicit duty-of-care limits**.

Core principle:

> Students speak in their own language. Agents translate experiences into self-knowledge. Human guides help when needed.

## Target User

Primary user: **secondary school students** making subject, CCA, pathway, portfolio, internship, and early ECG exploration choices.

First recommended wedge: **Sec 2 / lower secondary students preparing for subject and CCA choices**.

Why this wedge:

- The decision is immediate enough to matter.
- Students have fresh school experiences to reflect on.
- Future career choices are still too abstract for many students.
- Teachers and ECG counsellors can provide useful human guidance without the product pretending to determine a life path.

Secondary future use cases:

- Sec 4 / 5 post-secondary pathway choices: JC, poly, ITE, other routes.
- Portfolio reflection for DSA / EAE / scholarship / internship preparation.
- Internship or work exposure debriefs.
- Future career exploration, but as a later and softer layer.

## ECG Context

Singapore ECG guidance already points students toward a broad arc:

1. **Know yourself**
2. **Understand the world of work**
3. **Explore education pathways**
4. **Make informed choices**

MySkillsFuture for Students frames this around self-discovery and helping students understand what they value, what they are interested in, and what they are good at.

The opportunity for sensemaking-agents is not to replace MOE / MySkillsFuture resources. It is to become the missing layer before them:

> Raw school experience → self-understanding → better ECG conversation → better use of pathway resources.

## Core Promise

**Turn school experiences into self-understanding.**

More complete version:

> Reflect freely after class, CCA, projects, or school moments. sensemaking-agents connects your experiences over time, surfaces patterns about what matters to you, and helps you prepare better ECG conversations and choices.

## Positioning

Bad positioning:

> “AI tells students what career fits them.”

Better positioning:

> “AI helps students notice patterns in their own experiences before making choices.”

Best current positioning:

> “A guided reflection space where students connect everyday school experiences into self-understanding, with care boundaries and human guidance when needed.”

## Scope Boundary

### In scope for hackathon MVP

- Free-form student reflection after class, CCA, project, or school experience.
- Pause-based gentle nudges, not heavy upfront forms.
- Visible multi-agent handoff flow.
- Pattern matching across seeded prior reflections.
- ECG-relevant sensemaking around subjects, CCAs, pathways, portfolio, and next experiments.
- Guardian evaluator for overclaiming, safety, misuse, privacy, and evidence quality.
- Student-approved ECG reflection summary.
- Clear care-boundary disclosure.

### Out of scope for MVP

- Full career recommendation engine.
- Personality tests or psychometric diagnosis.
- Broad school admin dashboard.
- Silent teacher access to raw student reflections.
- Parent monitoring.
- Complex LMS integration.
- Fully automated counselling or life planning.

## Trust Model

This cannot be framed as completely private because schools and app operators carry duty-of-care risk.

Use this model instead:

> **Student-owned reflection with explicit care boundaries.**

### Normal Reflection Layer

- Student reflects freely.
- Agents sensemake and detect patterns.
- Raw reflections are not casually visible to teachers or counsellors.
- Student chooses whether to share an ECG summary.

### Guided Support Layer

- If patterns show confusion, decision anxiety, repeated stress, or uncertainty, the app suggests involving a human guide.
- The student can share a curated summary with an ECG counsellor, teacher, or trusted adult.
- The shared summary should be student-readable and student-editable before sending.

### Safety Escalation Layer

- If Guardian detects serious risk, the product may flag for human support.
- Escalation should be narrow and based on defined safety categories:
  - self-harm risk
  - harm to others
  - abuse or coercion
  - severe distress
  - urgent safeguarding concern
- The flag should include the minimum necessary excerpt and context, not the entire diary.
- Access and escalation events should be logged.
- Where appropriate and safe, the student should be informed that support is being requested.

Opening copy should be calm and explicit:

> “This is a guided school reflection space. Your reflections help you understand yourself and prepare ECG conversations. You choose what to share for normal guidance. If you mention serious risk of harm to yourself or others, a trusted school adult may be alerted to help keep you safe.”

## Core User Flow

1. Student finishes a CCA session, subject class, project, competition, volunteering moment, or school event.
2. Student opens a free-form reflection space.
3. The product says: “Tell me what happened today — class, CCA, project, anything that stayed with you.”
4. Student types or speaks naturally.
5. The system listens without turning the start into a worksheet.
6. If the student pauses, Guide offers one gentle nudge.
7. Student continues or stops.
8. Guide decides which specialist agents should run.
9. Mirror extracts self-understanding signals from the current experience.
10. Connector compares this reflection with past reflections.
11. Pathfinder maps patterns to ECG exploration options.
12. Coach suggests one small next experiment or question.
13. Guardian evaluates the synthesis for safety, privacy, overclaiming, and evidence quality.
14. Student reviews, edits, saves, or rejects the final memory.
15. Student may create a shareable ECG summary for a human guide.

## Pause-Based Prompting

The product should begin as a **listening room**, not an interview.

Do not start with:

- “What are your values?”
- “What strengths did you demonstrate?”
- “Which career cluster does this relate to?”

Start with:

> “Tell me what happened today — class, CCA, project, anything that stayed with you.”

Only after a pause, offer one gentle nudge:

- “What part stayed with you?”
- “Was there a moment you felt especially alive, stuck, proud, or drained?”
- “Anything about this that surprised you?”
- “What are you not sure how to interpret yet?”
- “Was there a moment you kept replaying in your head?”

Product principle:

> Sensemaking begins with listening, not questioning.

## Demo Scenario

Student has three seeded prior reflections:

1. Enjoyed helping juniors understand a CCA activity.
2. Felt bored memorising facts but enjoyed explaining concepts visually.
3. Felt proud presenting a group project, but anxious when work was unstructured.

New student reflection:

> “Today during robotics CCA, I liked explaining the sensor setup to the juniors more than actually debugging the code. In physics class, I also enjoyed the part where we connected circuits to real-world systems. I’m not sure if I like engineering, teaching, or just helping people understand things.”

sensemaking-agents output:

- **Guide:** “I’ll look at what this moment may reveal, then check whether it connects to past reflections.”
- **Mirror:** “You seemed energized by explanation, mentoring, and making technical ideas understandable.”
- **Connector:** “This connects to two earlier reflections where you enjoyed presenting and helping classmates.”
- **Pathfinder:** “Worth exploring: applied science, engineering design, robotics facilitation, teaching/mentoring roles, product or UX work involving technical explanation.”
- **Coach:** “Next experiment: lead the next CCA mini-demo and notice whether you enjoy preparing the explanation, answering questions, or building the demo itself.”
- **Guardian:** “Checked for overclaiming and safety. This should be presented as possibilities to explore, not as a label.”

## Agent Architecture

### 1. Guide / Orchestrator

Role: Owns the conversation arc and multi-agent choreography.

Core question:

> “What would help this student make sense of this without overwhelming them?”

Responsibilities:

- welcomes the student into a low-pressure reflection space
- detects pauses and chooses one gentle nudge when useful
- decides which agents should run
- sequences agent handoffs
- avoids over-analysis
- decides whether the reflection needs Mirror only, Mirror + Connector, or full ECG mapping
- synthesizes the final output into coherent student-facing language
- keeps the experience supportive, not diagnostic

Visible UI examples:

- “Guide is listening for what stayed with you…”
- “Guide is asking Mirror what this experience may reveal…”
- “Guide is asking Connector whether this matches earlier reflections…”
- “Guide is sending the draft to Guardian before showing it to you…”

### 2. Mirror

Role: Reads one experience closely and extracts self-understanding signals.

Core question:

> “What might this moment reveal about the student, without defining them?”

Looks for:

- what gives energy
- what drains energy
- curiosity
- frustration
- pride
- confidence
- avoidance
- values
- working style
- social role
- emerging strengths
- environment preferences

The Mirror may use the VITALS model privately as a schema:

- Values: what matters
- Interests: what keeps pulling attention
- Temperament: preferred ways of working
- Activities / energy: when and where the student feels alive or drained
- Life mission / goals: what feels meaningful
- Strengths / skills: what the student is becoming good at

But the UI should translate this into student language, not academic labels.

Output format:

- “What this may reveal”
- “Signals noticed”
- “What is still uncertain”
- “Evidence from your reflection”

### 3. Connector

Role: Finds patterns across reflections.

Core question:

> “Where have we seen this before, and how strong is the pattern?”

Looks for:

- repeated activities
- repeated emotions
- repeated strengths
- repeated avoidance or friction
- environments where the student thrives
- people or roles that energize or drain them
- contradictions over time
- changes in confidence or interest

Connector must show evidence. It should not invent patterns from one reflection.

Output format:

- “This connects to…”
- “Pattern emerging”
- “How strong this pattern is”
- “What still needs more evidence”

Pattern confidence examples:

- “Early signal: seen once.”
- “Emerging pattern: seen across three reflections.”
- “Strong pattern: repeated across different contexts.”
- “Contradiction: you enjoyed leading in CCA but disliked leading in group work; worth exploring why.”

### 4. Pathfinder

Role: Maps patterns to ECG exploration options.

Core question:

> “What choices or paths are now worth exploring?”

Pathfinder should not prescribe careers. It should suggest options to investigate.

For secondary students, priority order should be:

1. Subject choices
2. CCA roles and leadership opportunities
3. Project and portfolio directions
4. JC / poly / ITE pathways
5. Internships, attachments, volunteering, or exposure opportunities
6. Career clusters only as a light future-facing layer

Output format:

- “Options worth exploring”
- “Why these connect to your reflections”
- “What to learn before deciding”
- “Small experiment to test this”

Language rules:

- Use “may suggest,” “worth exploring,” “could be a fit to investigate.”
- Avoid “you are,” “you should,” “this proves,” “your best career is.”

### 5. Coach

Role: Turns insight into one small next experiment.

Core question:

> “What is one low-pressure action that would generate more self-knowledge?”

Good Coach outputs:

- “Ask your CCA teacher if you can help onboard juniors next week.”
- “After the next biology practical, notice whether you enjoyed the procedure, the explanation, or the problem-solving.”
- “Talk to one senior about what studying design, engineering, or applied science actually feels like.”
- “Try preparing a two-minute explanation for a classmate and notice whether that gives you energy.”

The Coach should avoid generic advice like “work harder,” “follow your passion,” or “believe in yourself.”

### 6. Guardian / Evaluator

Role: Evaluates safety, privacy, overclaiming, misuse, and quality before the student sees or shares output.

Core question:

> “Are we helping the student reflect, or pretending to define them?”

Guardian runs after the other agents and before final display.

Guardian checks:

- **Overdefinition:** “You are a natural engineer” should become “You may enjoy engineering-like problem solving.”
- **Deterministic advice:** “Take this subject” should become “This subject may be worth exploring.”
- **Evidence quality:** claims must be grounded in the student’s actual reflection or prior saved reflections.
- **Tone:** not too clinical, too motivational, too certain, or too adult-coded.
- **Sensitive signals:** self-harm, harm to others, abuse, coercion, bullying, severe burnout, severe distress.
- **Misuse:** adult attempts to profile, rank, discipline, or surveil students.
- **Privacy/access:** raw reflections should not be exposed casually.
- **Shareability:** summaries should be student-readable and appropriate for ECG guidance.

Guardian outputs:

```json
{
  "approved_for_student": true,
  "requires_softening": false,
  "safety_flag": "none | support_suggested | urgent_escalation",
  "privacy_flag": "none | contains_sensitive_detail | do_not_share_raw",
  "evidence_quality": "weak | moderate | strong",
  "rewrite_notes": [],
  "human_support_recommendation": null
}
```

Visible student-facing note:

> “Guardian checked this reflection for care, privacy, and overclaiming.”

Keep Guardian reassuring, not frightening.

## Human Guide Model

Teachers and ECG counsellors should be part of the system, but not as silent readers of student diaries.

### Normal ECG Sharing

Student can generate a summary for a human guide:

- “What I have been noticing about myself”
- “Patterns across my experiences”
- “Questions I want to discuss”
- “Subjects / CCAs / pathways I may want to explore”
- “What I am unsure about”

The student can edit before sharing.

### Access Requests

If a teacher or counsellor requests access to a reflection or summary:

- student is notified
- reason for request is shown
- student can approve, reject, or share a narrower summary
- access event is logged

### Safety Exceptions

For serious safety concerns, Guardian may escalate without waiting for normal sharing consent.

Even then:

- escalate minimum necessary information
- avoid broad raw diary access
- route to a trusted school adult or counsellor
- log access and escalation
- notify the student where appropriate and safe

## Technical Architecture and Data Model

The product should keep the agent loop simple and make the trust boundary explicit.

Recommended runtime shape:

> Next.js PWA → Vercel AI SDK streaming route → Convex data/actions → Trigger.dev or Inngest background job → Guardian evaluation → Convex commit → live UI update → Langfuse trace

Agents may reason and propose writes. The application owns persistence, permissions, safety artifacts, and audit logs.

### Recommended data tables

Do not store everything in one large reflection object. Split raw student authorship, agent interpretations, pattern memory, ECG sharing, and safety artifacts.

#### `students`

- `id`
- `display_name`
- `school_level`: `sec_1 | sec_2 | sec_3 | sec_4 | sec_5`
- `demo_profile`: boolean
- `created_at`

#### `reflections`

Append-only raw student-authored entries.

- `id`
- `student_id`
- `experience_type`: `subject_class | cca | project | competition | volunteering | internship | other`
- `raw_text`
- `source`: `typed | voice_transcript | seeded_demo`
- `created_at`
- `student_deleted_at`: nullable for future privacy UX

#### `agent_runs`

Every sensemaking run should be traceable.

- `id`
- `student_id`
- `reflection_id`
- `run_type`: `initial_reflection | memory_connection | ecg_summary | guardian_eval`
- `model_provider`
- `model_name`
- `prompt_version`
- `status`: `running | completed | failed | blocked_by_guardian`
- `langfuse_trace_id`: nullable
- `created_at`

#### `agent_interpretations`

Versioned agent outputs that the student can edit, reject, or confirm.

- `id`
- `reflection_id`
- `agent_run_id`
- `summary`
- `signals_json`
- `evidence_snippets_json`
- `uncertainties_json`
- `student_status`: `draft | confirmed | edited | rejected`
- `created_at`

#### `pattern_nodes`

Student-facing self-knowledge pages or cards.

- `id`
- `student_id`
- `title`: example, “I get energy from explaining technical ideas”
- `pattern_type`: `interest | value | energy | strength | working_style | environment | friction | uncertainty`
- `confidence`: `early | emerging | strong | contradictory`
- `student_status`: `suggested | confirmed | edited | rejected`
- `created_at`
- `updated_at`

#### `pattern_edges`

Evidence links between reflections and pattern nodes.

- `id`
- `pattern_node_id`
- `reflection_id`
- `evidence_excerpt`
- `agent_run_id`
- `created_at`

#### `ecg_summary_drafts`

Student-approved sharing artifacts, not raw diary access.

- `id`
- `student_id`
- `title`
- `summary_text`
- `questions_to_discuss_json`
- `options_to_explore_json`
- `student_status`: `draft | edited | approved | shared | discarded`
- `created_at`

#### `safety_flags`

Separate, minimal, audited escalation artifacts.

- `id`
- `student_id`
- `reflection_id`: nullable
- `severity`: `none | support_suggested | urgent_escalation`
- `category`: `self_harm | harm_to_others | abuse_or_coercion | severe_distress | safeguarding | other`
- `minimum_necessary_context`
- `guardian_rationale`
- `human_review_status`: `not_required | pending | reviewed | escalated | dismissed`
- `created_at`

#### `access_audit_logs`

Every non-student access or escalation event.

- `id`
- `student_id`
- `actor_type`: `student | agent | teacher | counsellor | admin | system`
- `actor_id`: nullable in hackathon demo
- `action`: `view_summary | request_access | approve_share | reject_share | create_safety_flag | review_safety_flag`
- `target_type`
- `target_id`
- `reason`
- `created_at`

### Tool boundary

Expose only narrow typed tools to agents:

- `saveRawReflection`
- `searchStudentMemory`
- `proposePatternNode`
- `linkReflectionEvidence`
- `draftEcgSummary`
- `runGuardianEval`
- `createSafetyFlag`
- `writeAuditLog`

Avoid generic filesystem, shell, browser, or unrestricted database tools in the student-facing runtime.

## MVP Feature Set

### Must-have

1. Free-form reflection input
   - text input first
   - voice input optional if time allows
   - no heavy form at the start

2. Pause-based nudge
   - detect inactivity or provide a manual “I’m stuck” action
   - show one gentle prompt only

3. Visible agent handoff display
   - show Guide, Connector, and Guardian as the main visible agents
   - let Mirror, Pathfinder, and Coach run as background lenses unless the demo needs to reveal them
   - show background coordination clearly

4. Seeded memory store
   - use Convex tables for raw reflections, interpretations, pattern nodes, ECG summaries, safety flags, and audit logs
   - save prior confirmed reflections
   - include 3–5 demo memories so pattern detection is visible
   - retrieve related reflections first by tags and simple text search; add embeddings only if time allows

5. Sensemaking output
   - signals
   - patterns
   - ECG exploration options
   - next question / next experiment

6. Guardian evaluation
   - overclaiming check
   - safety flag check
   - privacy/access check
   - evidence quality check

7. Student edit / confirm step
   - student can correct, reject, or save the interpretation
   - normal pattern memory is committed only after confirmation
   - raw reflections remain append-only once submitted

8. Shareable ECG summary
   - student-approved summary for counsellor / teacher discussion
   - not raw diary sharing by default

9. Care-boundary disclosure
   - clear upfront explanation that serious safety risks may be escalated

### Nice-to-have

- Voice reflection capture.
- Timeline view.
- Pattern map.
- CCA / subject filters.
- Exportable ECG reflection summary.
- Trusted adult review queue for safety flags.
- School-specific pathway dataset.

## Recommended Hackathon Stack

Use a TypeScript-first stack. The product needs fast UX iteration, streaming chat, durable memory, and auditable tool calls more than it needs a heavyweight autonomous-agent platform.

### Primary recommendation

- **App framework:** Next.js PWA
- **UI:** Tailwind + shadcn/ui
- **Chat and model streaming:** Vercel AI SDK
- **Agent loop:** Vercel AI SDK `ToolLoopAgent` or a small custom bounded loop
- **Model providers:** Anthropic and/or OpenAI through Vercel AI SDK providers
- **Database / realtime backend:** Convex
- **Background jobs:** Trigger.dev or Inngest
- **Observability / eval traces:** Langfuse
- **Voice:** browser MediaRecorder + transcription API, only if time allows
- **Retrieval:** start with Convex search and tagged seeded memories; add embeddings/vector search only if needed

### Why this stack

- **Vercel AI SDK** gives the best Next.js chat streaming and provider abstraction.
- **Convex** gives fast realtime state, persisted messages, server actions, file storage, and vector search without heavy backend setup.
- **Trigger.dev / Inngest** keeps slow sensemaking jobs out of the request path.
- **Langfuse** makes agent runs, prompts, tool calls, Guardian decisions, cost, and latency inspectable.

### What not to use first

- Do not start with full Pi / oh-my-pi as the runtime. It is shaped around coding agents, terminal tools, files, and patches.
- Do not start with Claude Managed Agents. It may simplify hosted agent infrastructure, but it blurs ownership of student memory and safety governance.
- Do not start with LangGraph unless the team already knows it. It is powerful, but adds orchestration tax.
- Do not build a Go backend for the hackathon unless the team is already much faster in Go than TypeScript.

### Later alternatives

- **Mastra:** good TypeScript-native upgrade if the product needs built-in workflows, memory, evals, and agent Studio.
- **LangGraph:** good later if the agent graph becomes complex, long-running, and stateful.
- **Supabase/Postgres:** good later if governance, SQL reporting, RLS, and institutional deployment matter more than speed.

For the hackathon, do not overbuild infrastructure. Make the choreography, pattern detection, and care model legible.

## Implementation Plan

### Phase 1: Product Skeleton

Goal: Make the product understandable before making it intelligent.

Tasks:

1. Initialize Next.js app with Tailwind and shadcn/ui.
2. Add Convex project and create the first demo student profile.
3. Create intro screen with one sentence:
   - “Connect school experiences into self-understanding for better ECG choices.”
4. Add care-boundary disclosure.
5. Create reflection input screen.
6. Create sample seeded reflections in Convex.
7. Create agent cards for Guide, Connector, Guardian, with Mirror / Pathfinder / Coach as secondary background lenses.
8. Create final insight summary screen.

Validation:

- A judge should understand the product in 20 seconds without explanation.
- A student should understand that this is supportive, but not an unlimited private diary.

### Phase 2: Free Reflection + Pause Nudges

Goal: Make the input feel like opening up, not filling a worksheet.

Tasks:

1. Implement free text reflection.
2. Add optional voice if time allows.
3. Add pause detection or a “help me continue” button.
4. Show one gentle nudge after pause.
5. Allow student to continue or finish.

Validation:

- The first interaction should feel light.
- The system should not ask for structured values/interests upfront.

### Phase 3: Reflection Processing

Goal: Turn one raw reflection into structured sensemaking.

Tasks:

1. Save raw reflection immediately to Convex `reflections`.
2. Send reflection ID and text to a Next.js streaming route using Vercel AI SDK.
3. Run a bounded Guide loop using `ToolLoopAgent` or a small custom loop.
4. Guide creates neutral summary and decides which lenses run.
5. Mirror extracts self-understanding signals.
6. Coach creates one next reflective question or experiment.
7. Save draft output to `agent_interpretations`.
8. Display outputs as editable cards.

Validation:

- Output should feel specific to the student’s experience, not generic motivational advice.

### Phase 4: Memory Connection

Goal: Show compounding value over time.

Tasks:

1. Store each confirmed interpretation as pattern proposals, not as overwritten raw reflection data.
2. Add 3–5 seeded past reflections and pattern nodes for demo.
3. Connector retrieves related reflections using tags/simple search first.
4. If time allows, add Convex vector search for semantic retrieval.
5. Connector creates or updates `pattern_nodes` and `pattern_edges` as proposals.
6. Display “patterns emerging” across experiences.
7. Show evidence snippets from prior reflections.

Validation:

- The app should be able to say: “This is the third time you described enjoying mentoring or explaining.”

### Phase 5: ECG Mapping

Goal: Connect self-understanding to exploration options without pretending certainty.

Tasks:

1. Create a small Singapore secondary ECG taxonomy.
2. Include subjects, CCA roles, project types, post-secondary pathways, and light career clusters.
3. Pathfinder maps patterns to possible options.
4. Show why each option is suggested.
5. Suggest one small next experiment.

Validation:

- The app should avoid deterministic language.
- Use “worth exploring,” “may suggest,” “test this by…” instead of “you should become…”

### Phase 6: Guardian Evaluation

Goal: Make the system safer and more trustworthy.

Tasks:

1. Run Guardian on the final synthesis before display and before normal pattern commits.
2. Emit structured JSON with severity, privacy flag, evidence quality, and rewrite notes.
3. Flag deterministic advice and rewrite it.
4. Flag unsupported claims.
5. Detect safety risks and assign severity: `none`, `support_suggested`, or `urgent_escalation`.
6. If safety flag is needed, create minimal `safety_flags` artifact and `access_audit_logs` entry.
7. Create visible Guardian note.
8. Send Langfuse trace metadata for the run, including prompt version, tool calls, and Guardian result.
9. For demo, show both normal pass and an example of “support suggested” without making the demo dark.

Validation:

- No output should define the student.
- Any safety escalation should be narrow, legible, and human-routed.

### Phase 7: Shareable ECG Summary

Goal: Involve human guides without turning the app into surveillance.

Tasks:

1. Generate student-approved ECG summary.
2. Let student edit before sharing.
3. Include “questions I want to discuss.”
4. Add access-request concept screen if time allows.
5. Add access log concept screen if time allows.

Validation:

- Sharing should feel like student agency, not adult extraction.

### Phase 8: Demo Polish

Goal: Make the multi-agent coordination memorable.

Tasks:

1. Animate agent handoffs.
2. Show Guide deciding which agents to consult.
3. Show Connector finding past memories.
4. Show Guardian checking output.
5. Show final student-facing summary.
6. Add one-click “save to my reflection map.”
7. Add one-click “prepare ECG conversation summary.”

Validation:

- The demo should make the audience feel: “This is not a chatbot. It is a guided sensemaking system with care boundaries.”

## Example Output Format

After a student reflection, show:

### What happened

Neutral summary of the experience.

### What it may reveal

Signals about what matters, what pulls attention, what gives energy, what drains energy, preferred working style, and emerging strengths.

### Pattern emerging

Connections to previous reflections, with evidence snippets.

### ECG options worth exploring

A few possible subject, CCA, pathway, project, portfolio, or exposure directions with reasons.

### Next small experiment

One action the student can take this week.

### Guardian note

A short reassurance that the output was checked for care, privacy, evidence, and overclaiming.

## Safety, Ethics, and Trust

This product touches identity, schooling, safety, and future choices. It must be careful.

Rules:

- Never claim to know the student better than they know themselves.
- Never make high-stakes recommendations as certainty.
- Never diagnose personality, mental health, or ability.
- Always let the student edit or reject interpretations.
- Make memory and access transparent.
- Do not promise full privacy if safety escalation exists.
- Do not give teachers silent raw diary access.
- Escalate only narrow, serious safety risks.
- Position outputs as prompts for reflection, not final answers.

Recommended student-facing copy:

> “These are patterns to consider, not labels. You can edit, reject, or save what feels true.”

Recommended care-boundary copy:

> “You choose what to share for normal ECG guidance. If you mention serious risk of harm to yourself or others, a trusted school adult may be alerted to help keep you safe.”

## Hackathon Judging Angle

Why this can win:

- It has a clear human problem.
- It uses multi-agent architecture for a real reason, not decoration.
- It creates compounding value through memory.
- It is emotionally legible for students.
- It connects AI output to real ECG choices without overclaiming.
- It has a credible school trust model instead of pretending to be a private diary.

Judge-friendly sentence:

> “Most ECG tools start with pathways and careers. sensemaking-agents starts with lived school experience — then helps students, agents, and human guides connect the dots.”

## Risks

### Risk 1: It sounds like generic career guidance

Mitigation: Lead with experience reflection, not career matching.

### Risk 2: Multi-agent system feels fake

Mitigation: Give each agent a distinct lens and show the handoff visibly.

### Risk 3: Advice becomes too deterministic

Mitigation: Guardian rewrites overconfident claims and forces exploratory language.

### Risk 4: Student input is too sparse

Mitigation: Guide asks one gentle pause-based nudge before final synthesis.

### Risk 5: Students do not trust the product because of safety escalation

Mitigation: Be explicit upfront. Do not imply full privacy. Limit escalation to serious safety risks and avoid casual adult access.

### Risk 6: Schools want surveillance features

Mitigation: Product stance should refuse silent monitoring. Offer student-approved summaries and narrow safety workflows only.

### Risk 7: Safety false positives create harm or embarrassment

Mitigation: Use Guardian severity levels, human review, minimal necessary context, and clear escalation policy.

## Open Questions

1. Which first demo moment is strongest: Sec 2 subject choice, CCA choice, or preparing for an ECG counselling session?
2. What exact safety escalation policy should the hackathon prototype claim?
3. Who is the trusted adult in the prototype: ECG counsellor, form teacher, year head, or school counsellor?
4. What does the student see when a safety flag is created?
5. Should the demo include a safety boundary screen, or only mention it in the pitch?
6. What Singapore-specific ECG taxonomy should be seeded first?
7. What is the minimum viable access log / sharing screen?

## Recommended Next Step

Build a thin vertical slice around one secondary student:

1. Care-boundary intro.
2. Three seeded past reflections.
3. One new CCA/class reflection.
4. Pause-based nudge.
5. Visible agent handoff.
6. Pattern detection.
7. Guardian evaluation.
8. ECG exploration suggestions.
9. Student-approved ECG summary.
10. One next experiment.

Do not build broad career search. Do not build a school dashboard first. The winning demo is the moment a student sees a real pattern in their lived experience, then can choose how to turn that into a better ECG conversation.
