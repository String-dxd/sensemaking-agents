/**
 * Centralized model + feature-flag config for the sensemaking agents.
 *
 * Two coexisting runtimes during the managed-agents migration
 * (`plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`):
 *
 *   - **OpenAI runner (legacy).** Per-agent model id read from
 *     `process.env.AGENT_MODEL` at module-load, with a `'gpt-5.5'` default.
 *     The ablate script's `--model=<id>` flag is the canonical A/B seam — it
 *     parses argv and sets `process.env.AGENT_MODEL` before any agent
 *     factory import. The four per-agent constants stay in lockstep on
 *     purpose; v0.3 may want to fork Mirror onto a cheaper model.
 *     `||` (not `??`) is intentional — an empty-string `AGENT_MODEL=` is
 *     treated as unset and falls through to the default.
 *
 *   - **Managed Agents runner (Step 6+).** Per-agent ids/versions live in
 *     `.env` (or Vercel env vars), populated by
 *     `scripts/managed-agents/provision.ts`. The runtime model is pinned by
 *     the agent version on Anthropic's side; we never override it from
 *     this process. The accessors below read `process.env` at call time so
 *     that test setup (and the ablate script's argv parsing) sees the
 *     latest values.
 *
 * Note: `CARTOGRAPHER_MODEL` is the v0.2 name for the Pathfinder/Cartographer
 * role. As of U10, `src/agents/cartographer.ts` imports it; the legacy
 * `pathfinder.ts` was renamed to `cartographer.ts` and the const name now
 * matches the agent.
 */

// ── OpenAI runner — legacy per-agent model ids (cutover via USE_MANAGED_AGENTS) ──

export const MIRROR_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const CONNECTOR_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const CARTOGRAPHER_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'
export const SELF_CRITIQUE_MODEL = process.env.AGENT_MODEL || 'gpt-5.5'

// ── Managed Agents — runtime feature flag + env-var accessors ──

/**
 * Routes Mirror/Connector/Cartographer through `src/agents/runner.ts` (the
 * Managed Agents path) instead of the `@openai/agents` runtime. Evaluated
 * at call time so a single process can flip between the two runtimes
 * across tests and ablation runs.
 *
 * Accepted truthy values: `1`, `true`, `yes`. Anything else (including
 * unset, empty string, `0`, `false`) is false.
 */
export function isManagedAgentsEnabled(): boolean {
  const raw = (process.env.USE_MANAGED_AGENTS ?? '').toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export type ManagedAgentName = 'mirror' | 'connector' | 'cartographer' | 'self_critique'

export interface ManagedAgentBinding {
  agentId: string
  agentVersion: number | undefined
  environmentId: string
}

/**
 * Read the provisioned agent id + version + shared environment id for a
 * given agent name. Throws a clear error if any required key is missing —
 * `runManagedAgent` will surface this as a startup-time configuration bug
 * rather than a request-time Anthropic 404.
 *
 * `MANAGED_AGENT_<NAME>_VERSION` is optional: omit to pin to the latest
 * version on Anthropic's side. Provisioning writes a version on every
 * run, so a populated `.env.local` always has it set.
 */
export function getManagedAgentBinding(name: ManagedAgentName): ManagedAgentBinding {
  const prefix = `MANAGED_AGENT_${name.toUpperCase()}`
  const agentId = process.env[`${prefix}_ID`]
  if (!agentId) {
    throw new Error(
      `getManagedAgentBinding(${name}): ${prefix}_ID is not set. Run \`pnpm provision:managed-agents\` and source .env.local.`,
    )
  }
  const environmentId = process.env.MANAGED_AGENT_ENV_ID
  if (!environmentId) {
    throw new Error(
      'getManagedAgentBinding: MANAGED_AGENT_ENV_ID is not set. Run `pnpm provision:managed-agents` and source .env.local.',
    )
  }
  const versionRaw = process.env[`${prefix}_VERSION`]
  const agentVersion =
    versionRaw && versionRaw.length > 0 && Number.isFinite(Number.parseInt(versionRaw, 10))
      ? Number.parseInt(versionRaw, 10)
      : undefined
  return { agentId, agentVersion, environmentId }
}
