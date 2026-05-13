#!/usr/bin/env tsx
/**
 * Managed Agents provisioning script — Step 5 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * What it does (idempotently):
 *   1. Reads `.env`. If a `MANAGED_AGENT_*_ID` key already exists for a
 *      given agent (or for the environment), the corresponding create call is
 *      skipped and the existing id/version are reused.
 *   2. Creates the four managed agents — `mirror`, `connector`, `cartographer`,
 *      `self_critique` — via `client.beta.agents.create`. Each loads its
 *      system prompt from `src/agents/<name>.prompt.md`; `self_critique` is
 *      the eval/safety reviewer for agent outputs.
 *   3. Creates a single `sensemaking-prod` environment (cloud-networking) via
 *      `client.beta.environments.create`.
 *   4. Writes the merged result back to `.env`, preserving any
 *      unrelated keys and comments. Prints a result table and a
 *      copy-pasteable `vercel env add` snippet at the end.
 *
 * Env required at runtime:
 *   - `ANTHROPIC_API_KEY` — used to authenticate against the Managed Agents
 *     beta surface (`anthropic-beta: managed-agents-2026-04-01`).
 *
 * Keys written/read in `.env`:
 *   ANTHROPIC_API_KEY=
 *   MANAGED_AGENT_ENV_ID=
 *   MANAGED_AGENT_MIRROR_ID=
 *   MANAGED_AGENT_MIRROR_VERSION=
 *   MANAGED_AGENT_CONNECTOR_ID=
 *   MANAGED_AGENT_CONNECTOR_VERSION=
 *   MANAGED_AGENT_CARTOGRAPHER_ID=
 *   MANAGED_AGENT_CARTOGRAPHER_VERSION=
 *   MANAGED_AGENT_SELF_CRITIQUE_ID=
 *   MANAGED_AGENT_SELF_CRITIQUE_VERSION=
 *
 * Usage:
 *   pnpm provision:managed-agents
 *   pnpm provision:managed-agents -- --update-existing connector,cartographer,self_critique
 *   (or directly: pnpm tsx scripts/managed-agents/provision.ts)
 */

import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_BETA_HEADER = 'managed-agents-2026-04-01'
const ENVIRONMENT_NAME = 'sensemaking-prod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..', '..')
const ENV_PATH = resolve(REPO_ROOT, '.env')
const AGENT_PROMPT_DIR = resolve(REPO_ROOT, 'src', 'agents')

interface AgentSpec {
  /** Logical name; also used as the prefix for env-var keys. */
  name: 'mirror' | 'connector' | 'cartographer' | 'self_critique'
  /** Anthropic model id. */
  model: string
  /** Max output tokens per invocation. */
  maxTokens: number
  /** System prompt (resolved from .prompt.md file or inline string). */
  systemPrompt: string
}

function loadPrompt(name: string): string {
  const path = resolve(AGENT_PROMPT_DIR, `${name}.prompt.md`)
  return readFileSync(path, 'utf8')
}

function buildAgentSpecs(): AgentSpec[] {
  return [
    {
      name: 'mirror',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      systemPrompt: loadPrompt('mirror'),
    },
    {
      name: 'connector',
      model: 'claude-sonnet-4-6',
      maxTokens: 2048,
      systemPrompt: loadPrompt('connector'),
    },
    {
      name: 'cartographer',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      systemPrompt: loadPrompt('cartographer'),
    },
    {
      name: 'self_critique',
      model: 'claude-haiku-4-5',
      maxTokens: 2048,
      systemPrompt: loadPrompt('self_critique'),
    },
  ]
}

// ── .env parse + merge ──────────────────────────────────────────────────────

type EnvEntry =
  | { kind: 'kv'; key: string; value: string; raw: string }
  | { kind: 'raw'; raw: string }

function parseEnvFile(path: string): EnvEntry[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf8')
  return text.split('\n').map<EnvEntry>((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return { kind: 'raw', raw: line }
    }
    const eq = line.indexOf('=')
    if (eq === -1) return { kind: 'raw', raw: line }
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1)
    return { kind: 'kv', key, value, raw: line }
  })
}

function readEnvKey(entries: EnvEntry[], key: string): string | undefined {
  for (const e of entries) {
    if (e.kind === 'kv' && e.key === key) return e.value
  }
  return undefined
}

function upsertEnvKey(entries: EnvEntry[], key: string, value: string): EnvEntry[] {
  let found = false
  const next = entries.map<EnvEntry>((e) => {
    if (e.kind === 'kv' && e.key === key) {
      found = true
      return { kind: 'kv', key, value, raw: `${key}=${value}` }
    }
    return e
  })
  if (!found) {
    next.push({ kind: 'kv', key, value, raw: `${key}=${value}` })
  }
  return next
}

function serializeEnv(entries: EnvEntry[]): string {
  return `${entries.map((e) => e.raw).join('\n')}\n`.replace(/\n+$/u, '\n')
}

function envKeyPrefix(name: AgentSpec['name']): string {
  return `MANAGED_AGENT_${name.toUpperCase()}`
}

// ── Provisioning ────────────────────────────────────────────────────────────

interface ProvisionResult {
  label: string
  id: string
  version: string
  action: 'created' | 'updated' | 'skipped'
}

// The Anthropic SDK may not yet expose first-class typed bindings for the
// Managed Agents beta. We narrow to a loose shape and let the runtime calls
// surface any drift as a clear error. `getBetaSurface` validates both
// resources are present, so downstream call sites get the non-optional form.
type AgentBetaResource = {
  create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
  update?: (id: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
type EnvironmentBetaResource = {
  create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
type BetaSurface = { agents: AgentBetaResource; environments: EnvironmentBetaResource }
type LooseBeta = { agents?: AgentBetaResource; environments?: EnvironmentBetaResource }

function getBetaSurface(client: Anthropic): BetaSurface {
  // biome-ignore lint/suspicious/noExplicitAny: beta surface may be untyped in SDK
  const beta = (client as any).beta as LooseBeta | undefined
  if (!beta?.agents || !beta.environments) {
    throw new Error(
      'The installed @anthropic-ai/sdk does not expose `client.beta.agents` / `client.beta.environments`. ' +
        'Upgrade the SDK to a version supporting the `managed-agents-2026-04-01` beta, or check the API shape and adjust this script.',
    )
  }
  return { agents: beta.agents, environments: beta.environments }
}

function pickField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

async function provisionEnvironment(
  beta: BetaSurface,
  envEntries: EnvEntry[],
): Promise<{ result: ProvisionResult; entries: EnvEntry[] }> {
  const existingId = readEnvKey(envEntries, 'MANAGED_AGENT_ENV_ID')
  const existingVersion = readEnvKey(envEntries, 'MANAGED_AGENT_ENV_VERSION')
  if (existingId) {
    return {
      result: {
        label: ENVIRONMENT_NAME,
        id: existingId,
        version: existingVersion ?? '(unset)',
        action: 'skipped',
      },
      entries: envEntries,
    }
  }
  // SDK shape change (anthropic-beta managed-agents-2026-04-01 onwards):
  // `networking` is no longer a top-level param. It now lives inside `config`,
  // where `config.type='cloud'` selects the cloud-runtime variant and
  // `networking.type='unrestricted'` matches the prior `networking: 'cloud'`
  // posture (egress open; restrict later via BetaLimitedNetworkParams if a
  // tighter policy is needed).
  const raw = await beta.environments.create({
    name: ENVIRONMENT_NAME,
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  })
  const id =
    pickField(raw, 'id', 'environment_id') ?? throwShape('environment.create returned no id', raw)
  const version = pickField(raw, 'version', 'environment_version') ?? '1'
  let next = upsertEnvKey(envEntries, 'MANAGED_AGENT_ENV_ID', id)
  next = upsertEnvKey(next, 'MANAGED_AGENT_ENV_VERSION', version)
  return {
    result: { label: ENVIRONMENT_NAME, id, version, action: 'created' },
    entries: next,
  }
}

async function provisionAgent(
  beta: BetaSurface,
  spec: AgentSpec,
  envEntries: EnvEntry[],
  environmentId: string,
  updateExistingAgents: ReadonlySet<AgentSpec['name']>,
): Promise<{ result: ProvisionResult; entries: EnvEntry[] }> {
  const prefix = envKeyPrefix(spec.name)
  const existingId = readEnvKey(envEntries, `${prefix}_ID`)
  const existingVersion = readEnvKey(envEntries, `${prefix}_VERSION`)
  if (existingId) {
    if (updateExistingAgents.has(spec.name)) {
      if (!existingVersion) {
        throw new Error(
          `${prefix}_VERSION is required to update existing managed agent ${existingId}. ` +
            'Fetch the current version from Anthropic or recreate the agent.',
        )
      }
      const version = Number(existingVersion)
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`${prefix}_VERSION must be a positive integer; got ${existingVersion}.`)
      }
      if (!beta.agents.update) {
        throw new Error(
          'The installed @anthropic-ai/sdk does not expose `client.beta.agents.update`. ' +
            'Upgrade the SDK or update the agent with `ant beta:agents update`.',
        )
      }
      const raw = await beta.agents.update(existingId, {
        version,
        name: spec.name,
        model: spec.model,
        system: spec.systemPrompt,
      })
      const nextVersion = pickField(raw, 'version', 'agent_version') ?? String(version + 1)
      const next = upsertEnvKey(envEntries, `${prefix}_VERSION`, String(nextVersion))
      return {
        result: {
          label: spec.name,
          id: existingId,
          version: String(nextVersion),
          action: 'updated',
        },
        entries: next,
      }
    }
    return {
      result: {
        label: spec.name,
        id: existingId,
        version: existingVersion ?? '(unset)',
        action: 'skipped',
      },
      entries: envEntries,
    }
  }
  // SDK shape change (anthropic-beta managed-agents-2026-04-01 onwards):
  //   • `environment_id` is no longer accepted on agent create. The
  //     environment is now bound at SESSION creation time (and via
  //     `resources[]` for memory stores), not at agent definition time.
  //     `runManagedAgent` already passes `environment_id` to
  //     `beta.sessions.create`, so the runtime wiring is unchanged.
  //   • `max_tokens` is no longer accepted on agent create. Per-call
  //     output limits move to session/message time; we'll add them there
  //     if the unbounded default surfaces a real cost ceiling concern.
  // `spec.maxTokens` is retained on the AgentSpec for documentation —
  // if Anthropic re-introduces per-agent token caps, the values are here.
  const raw = await beta.agents.create({
    name: spec.name,
    model: spec.model,
    system: spec.systemPrompt,
  })
  void environmentId // suppress unused-parameter signal; caller still threads it
  const id =
    pickField(raw, 'id', 'agent_id') ??
    throwShape(`agents.create(${spec.name}) returned no id`, raw)
  const version = pickField(raw, 'version', 'agent_version') ?? '1'
  let next = upsertEnvKey(envEntries, `${prefix}_ID`, id)
  next = upsertEnvKey(next, `${prefix}_VERSION`, version)
  return {
    result: { label: spec.name, id, version, action: 'created' },
    entries: next,
  }
}

function parseUpdateExistingAgents(argv: string[]): ReadonlySet<AgentSpec['name']> {
  const flagIndex = argv.indexOf('--update-existing')
  if (flagIndex === -1) return new Set()

  const raw = argv[flagIndex + 1]
  if (!raw || raw.startsWith('--') || raw === 'all') {
    return new Set(['mirror', 'connector', 'cartographer', 'self_critique'])
  }

  const allowed = new Set<AgentSpec['name']>([
    'mirror',
    'connector',
    'cartographer',
    'self_critique',
  ])
  const requested = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
  for (const name of requested) {
    if (!allowed.has(name as AgentSpec['name'])) {
      throw new Error(
        `Unknown --update-existing agent "${name}". Expected one of: ${Array.from(allowed).join(', ')}, or all.`,
      )
    }
  }
  return new Set(requested as AgentSpec['name'][])
}

function throwShape(msg: string, raw: unknown): never {
  throw new Error(`${msg}. Raw response: ${JSON.stringify(raw)}`)
}

// ── Reporting ───────────────────────────────────────────────────────────────

function printResultTable(results: ProvisionResult[]): void {
  const header = ['name', 'id', 'version', 'action']
  const rows = results.map((r) => [r.label, r.id, r.version, r.action])
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ')
  process.stdout.write(`\n${fmt(header)}\n`)
  process.stdout.write(`${widths.map((w) => '-'.repeat(w)).join('  ')}\n`)
  for (const r of rows) process.stdout.write(`${fmt(r)}\n`)
}

function printVercelInstructions(changedKeys: string[]): void {
  if (changedKeys.length === 0) {
    process.stdout.write(
      '\nNo managed-agent env vars changed — nothing new to upload.\n',
    )
    return
  }
  process.stdout.write(
    '\nVercel env-var setup — update these keys (production + preview), then redeploy:\n\n',
  )
  for (const key of changedKeys) {
    process.stdout.write(`  vercel env add ${key} production\n`)
    process.stdout.write(`  vercel env add ${key} preview\n`)
  }
  process.stdout.write('\nOr use the Vercel dashboard: Project Settings → Environment Variables.\n')
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const updateExistingAgents = parseUpdateExistingAgents(process.argv.slice(2))
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    process.stderr.write(
      'ERROR: ANTHROPIC_API_KEY is not set. Add it to .env or your shell env and re-run.\n',
    )
    process.exit(1)
  }

  const client = new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': ANTHROPIC_BETA_HEADER },
  })
  const beta = getBetaSurface(client)

  let envEntries = parseEnvFile(ENV_PATH)
  const initialValues = new Map(
    envEntries.flatMap((e) => (e.kind === 'kv' ? [[e.key, e.value] as const] : [])),
  )

  const { result: envResult, entries: afterEnv } = await provisionEnvironment(beta, envEntries)
  envEntries = afterEnv

  const specs = buildAgentSpecs()
  const results: ProvisionResult[] = [envResult]
  for (const spec of specs) {
    const { result, entries } = await provisionAgent(
      beta,
      spec,
      envEntries,
      envResult.id,
      updateExistingAgents,
    )
    envEntries = entries
    results.push(result)
  }

  writeFileSync(ENV_PATH, serializeEnv(envEntries), 'utf8')

  const changedManagedKeys = envEntries.flatMap((e) =>
    e.kind === 'kv' && e.key.startsWith('MANAGED_AGENT_') && initialValues.get(e.key) !== e.value
      ? [e.key]
      : [],
  )

  printResultTable(results)
  process.stdout.write(`\nWrote merged ids/versions to ${ENV_PATH}\n`)
  printVercelInstructions(changedManagedKeys)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`provision.ts failed:\n${msg}\n`)
  process.exit(1)
})
