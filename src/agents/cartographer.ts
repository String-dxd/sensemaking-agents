import { Agent } from '@openai/agents'
import cartographerPrompt from '~/agents/cartographer.prompt.md?raw'
import { CARTOGRAPHER_MODEL } from '~/agents/config'
import { CartographerOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { lookupVipsTaxonomyTool } from '~/agents/tools/lookup-vips-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'

export interface BuildCartographerAgentOpts {
  studentId: string
}

/**
 * Build a Cartographer Agent bound to a single studentId. Identical three-tool
 * surface as Connector (R11); only `instructions` and `outputType` differ.
 *
 * v0.2 (U11): the output schema is the lead-sheet Trajectory page shape
 * `{trajectory_paragraph, pathways, open_questions, disclaimer}` where each
 * pathway carries trait_combination (canonical VIPS claim IDs), cluster-level
 * ecg_region_tags, risks_tradeoffs, and an exploration_prompt. The 2–5
 * pathway count is enforced at the schema boundary; the validity of the
 * cited claim IDs and ecg_region_tag strings is checked post-hoc by
 * `run-cartographer.handler.server.ts` so a single invalid pathway can be
 * dropped without rejecting the whole output.
 */
export function buildCartographerAgent({ studentId }: BuildCartographerAgentOpts) {
  return new Agent({
    name: 'cartographer',
    model: CARTOGRAPHER_MODEL,
    instructions: cartographerPrompt,
    tools: [
      searchCorpusToolFor(studentId),
      lookupEcgTaxonomyTool,
      lookupVipsTaxonomyTool,
      selfCritiqueTool,
    ],
    outputType: CartographerOutputSchema,
  })
}
