import { Agent } from '@openai/agents'
import { CARTOGRAPHER_MODEL } from '~/agents/config'
import pathfinderPrompt from '~/agents/pathfinder.prompt.md?raw'
import { PathfinderOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'

export interface BuildPathfinderAgentOpts {
  studentId: string
}

/**
 * Build a Pathfinder Agent bound to a single studentId. Identical three-tool
 * surface as Connector (R11); only `instructions` and `outputType` differ.
 */
export function buildPathfinderAgent({ studentId }: BuildPathfinderAgentOpts) {
  return new Agent({
    name: 'pathfinder',
    model: CARTOGRAPHER_MODEL,
    instructions: pathfinderPrompt,
    tools: [searchCorpusToolFor(studentId), lookupEcgTaxonomyTool, selfCritiqueTool],
    outputType: PathfinderOutputSchema,
  })
}
