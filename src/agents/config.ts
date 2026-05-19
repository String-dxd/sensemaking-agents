/**
 * Managed Agents — env-var accessors for the Claude-backed agent bindings
 * provisioned by `scripts/managed-agents/provision.ts`. Mirror now runs on
 * OpenAI Realtime, so this accessor is intentionally limited to Connector,
 * Cartographer, and self-critique.
 */

export type ManagedAgentName = 'connector' | 'cartographer' | 'self_critique'

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
 * run, so a populated `.env` always has it set.
 */
export function getManagedAgentBinding(name: ManagedAgentName): ManagedAgentBinding {
  const prefix = `MANAGED_AGENT_${name.toUpperCase()}`
  const agentId = process.env[`${prefix}_ID`]
  if (!agentId) {
    throw new Error(
      `getManagedAgentBinding(${name}): ${prefix}_ID is not set. Run \`pnpm provision:managed-agents\` and source .env.`,
    )
  }
  const environmentId = process.env.MANAGED_AGENT_ENV_ID
  if (!environmentId) {
    throw new Error(
      'getManagedAgentBinding: MANAGED_AGENT_ENV_ID is not set. Run `pnpm provision:managed-agents` and source .env.',
    )
  }
  const versionRaw = process.env[`${prefix}_VERSION`]
  const agentVersion =
    versionRaw && versionRaw.length > 0 && Number.isFinite(Number.parseInt(versionRaw, 10))
      ? Number.parseInt(versionRaw, 10)
      : undefined
  return { agentId, agentVersion, environmentId }
}
