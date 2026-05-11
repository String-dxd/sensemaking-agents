/**
 * Centralized model config for the sensemaking agents.
 *
 * Each agent reads its model id from `process.env.AGENT_MODEL`, falling back
 * to the v0.2 default `'gpt-5.5'`. The override is evaluated at module-load
 * time, so callers (e.g. `pnpm ablate:*`, the Vite dev server) must set
 * `AGENT_MODEL` *before* importing the agent factories. The ablate script's
 * `--model=<id>` flag is the canonical A/B seam: it parses argv and sets
 * `process.env.AGENT_MODEL` before any agent import.
 *
 * `||` (not `??`) is intentional — an empty-string `AGENT_MODEL=` is treated
 * as unset and falls through to the default, matching shell ergonomics.
 *
 * Per-agent constants (rather than one shared `AGENT_MODEL`) preserve the
 * option to keep Mirror on a cheaper model in v0.3 without re-plumbing.
 *
 * Note: `CARTOGRAPHER_MODEL` is the v0.2 name for the Pathfinder/Cartographer
 * role. The file `src/agents/pathfinder.ts` still imports it under that name
 * until U10 renames the file to `cartographer.ts`.
 */

export const MIRROR_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const CONNECTOR_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const CARTOGRAPHER_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const SELF_CRITIQUE_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
