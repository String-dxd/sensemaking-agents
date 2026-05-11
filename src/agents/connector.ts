import { Agent } from '@openai/agents'
import { CONNECTOR_MODEL } from '~/agents/config'
import connectorPrompt from '~/agents/connector.prompt.md?raw'
import { ConnectorDiffSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { lookupVipsTaxonomyTool } from '~/agents/tools/lookup-vips-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'

export interface CreateConnectorAgentOpts {
  studentId: string
}

/**
 * U7: Connector — auto-runs after every `persistMirror` and proposes a VIPS
 * diff (per-dimension compiled-truth rewrite + open question + new timeline
 * entry drafts). The output is staged into `vips_proposed_diffs` and gated
 * by the deterministic verifier (U6) before the student sees it on the
 * review surface (U8).
 *
 * Tools (R11 — Connector + Cartographer share the sense-maker tool surface):
 *   - `search_past_mirrors` — student-scoped FTS5 over Mirror story_reframe
 *   - `lookup_ecg_taxonomy` — SG-context anchoring when a CCA/subject recurs
 *   - `lookup_vips_taxonomy` — canonical VIPS vocabulary (U2)
 *   - `self_critique` — single-pass critique on `evidence` / `sycophancy`
 *
 * Output: `ConnectorDiffSchema` — the verifier-owned fields
 * (`reinforces_id`, `partial_match`, `aspirational`, `parallax_cap_reason`)
 * are NOT on the agent's draft per A5.
 *
 * Legacy alias `buildConnectorAgent` is retained so the v0.1 manual sense-
 * making chain (`handoff-chain.ts`, `handoff-chain-streamed.ts`) still
 * imports cleanly during the cutover. U11 phases that chain out for the
 * Cartographer-only manual surface.
 */
export function createConnectorAgent({ studentId }: CreateConnectorAgentOpts) {
  return new Agent({
    name: 'connector',
    model: CONNECTOR_MODEL,
    instructions: connectorPrompt,
    tools: [
      searchCorpusToolFor(studentId),
      lookupEcgTaxonomyTool,
      selfCritiqueTool,
      lookupVipsTaxonomyTool,
    ],
    outputType: ConnectorDiffSchema,
  })
}

/** @deprecated Use `createConnectorAgent`. Retained for v0.1 chain imports. */
export const buildConnectorAgent = createConnectorAgent
