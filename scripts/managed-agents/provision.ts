#!/usr/bin/env tsx
/**
 * Managed Agents provisioning script — Step 5 of
 * `plans/2026-05-12-002-feat-managed-agents-full-migration-plan.md`.
 *
 * What it does (idempotently):
 *   1. Reads `.env.local`. If a `MANAGED_AGENT_*_ID` key already exists for a
 *      given agent (or for the environment), the corresponding create call is
 *      skipped and the existing id/version are reused.
 *   2. Creates the four managed agents — `mirror`, `connector`, `cartographer`,
 *      `self_critique` — via `client.beta.agents.create`. The first three load
 *      their system prompt from `src/agents/<name>.prompt.md`; `self_critique`
 *      uses a short inline prompt mirroring `src/agents/tools/self-critique.ts`
 *      and is provisioned for symmetry only — it is invoked at runtime as a
 *      Messages-API tool (plan §7.2), not as a Managed Agent.
 *   3. Creates a single `sensemaking-prod` environment (cloud-networking) via
 *      `client.beta.environments.create`.
 *   4. Writes the merged result back to `.env.local`, preserving any
 *      unrelated keys and comments. Prints a result table and a
 *      copy-pasteable `vercel env add` snippet at the end.
 *
 * Env required at runtime:
 *   - `ANTHROPIC_API_KEY` — used to authenticate against the Managed Agents
 *     beta surface (`anthropic-beta: managed-agents-2026-04-01`).
 *
 * Keys written/read in `.env.local` (mirrored in `.env.example`):
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
const ENV_LOCAL_PATH = resolve(REPO_ROOT, '.env.local')
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

const SELF_CRITIQUE_INLINE_PROMPT = `You are a critique-only reviewer. You will be given a draft from another agent (Connector or Pathfinder) and one specific dimension to evaluate it against. Return a structured critique. Do not rewrite the draft. Do not be polite for politeness's sake. Confidence: low / medium / high based on how strong your evidence is.`

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
      model: 'claude-haiku-4-5',
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
      systemPrompt: SELF_CRITIQUE_INLINE_PROMPT,
    },
  ]
}

// ── .env.local parse + merge ────────────────────────────────────────────────

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
  action: 'created' | 'skipped'
}

// The Anthropic SDK may not yet expose first-class typed bindings for the
// Managed Agents beta. We narrow to a loose shape and let the runtime calls
// surface any drift as a clear error. `getBetaSurface` validates both
// resources are present, so downstream call sites get the non-optional form.
type BetaResource = {
  create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
type BetaSurface = { agents: BetaResource; environments: BetaResource }
type LooseBeta = { agents?: BetaResource; environments?: BetaResource }

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
  const raw = await beta.environments.create({
    name: ENVIRONMENT_NAME,
    networking: 'cloud',
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
): Promise<{ result: ProvisionResult; entries: EnvEntry[] }> {
  const prefix = envKeyPrefix(spec.name)
  const existingId = readEnvKey(envEntries, `${prefix}_ID`)
  const existingVersion = readEnvKey(envEntries, `${prefix}_VERSION`)
  if (existingId) {
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
  const raw = await beta.agents.create({
    name: spec.name,
    model: spec.model,
    max_tokens: spec.maxTokens,
    system: spec.systemPrompt,
    environment_id: environmentId,
  })
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

function printVercelInstructions(createdKeys: string[]): void {
  if (createdKeys.length === 0) {
    process.stdout.write(
      '\nAll managed-agent ids were already present in .env.local — nothing new to upload.\n',
    )
    return
  }
  process.stdout.write(
    '\nVercel env-var setup — copy-paste these (production + preview), then redeploy:\n\n',
  )
  for (const key of createdKeys) {
    process.stdout.write(`  vercel env add ${key} production\n`)
    process.stdout.write(`  vercel env add ${key} preview\n`)
  }
  process.stdout.write('\nOr use the Vercel dashboard: Project Settings → Environment Variables.\n')
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    process.stderr.write(
      'ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local or your shell env and re-run.\n',
    )
    process.exit(1)
  }

  const client = new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': ANTHROPIC_BETA_HEADER },
  })
  const beta = getBetaSurface(client)

  let envEntries = parseEnvFile(ENV_LOCAL_PATH)
  const initialKeys = new Set(envEntries.flatMap((e) => (e.kind === 'kv' ? [e.key] : [])))

  const { result: envResult, entries: afterEnv } = await provisionEnvironment(beta, envEntries)
  envEntries = afterEnv

  const specs = buildAgentSpecs()
  const results: ProvisionResult[] = [envResult]
  for (const spec of specs) {
    const { result, entries } = await provisionAgent(beta, spec, envEntries, envResult.id)
    envEntries = entries
    results.push(result)
  }

  writeFileSync(ENV_LOCAL_PATH, serializeEnv(envEntries), 'utf8')

  const newlyCreatedKeys = envEntries.flatMap((e) =>
    e.kind === 'kv' && e.key.startsWith('MANAGED_AGENT_') && !initialKeys.has(e.key) ? [e.key] : [],
  )

  printResultTable(results)
  process.stdout.write(`\nWrote merged ids/versions to ${ENV_LOCAL_PATH}\n`)
  printVercelInstructions(newlyCreatedKeys)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`provision.ts failed:\n${msg}\n`)
  process.exit(1)
})
