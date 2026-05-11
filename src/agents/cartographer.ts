import { Agent } from '@openai/agents'
import cartographerPrompt from '~/agents/cartographer.prompt.md?raw'
import { CARTOGRAPHER_MODEL } from '~/agents/config'
import { CartographerOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'

export interface BuildCartographerAgentOpts {
  studentId: string
}

/**
 * Build a Cartographer Agent bound to a single studentId. Identical three-tool
 * surface as Connector (R11); only `instructions` and `outputType` differ.
 *
 * v0.2 rename note: this agent was named Pathfinder in v0.1. U10 performed the
 * mechanical rename only — the v0.1 output schema body (`trajectory, pathways,
 * disclaimer`) is preserved here. U11 reshapes the output to v0.2's
 * `trajectory_text, pathways, open_questions, disclaimer` shape.
 */
export function buildCartographerAgent({ studentId }: BuildCartographerAgentOpts) {
  return new Agent({
    name: 'cartographer',
    model: CARTOGRAPHER_MODEL,
    instructions: cartographerPrompt,
    tools: [searchCorpusToolFor(studentId), lookupEcgTaxonomyTool, selfCritiqueTool],
    outputType: CartographerOutputSchema,
  })
}
