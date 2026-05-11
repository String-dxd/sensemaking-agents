import { Agent } from '@openai/agents'
import { CONNECTOR_MODEL } from '~/agents/config'
import connectorPrompt from '~/agents/connector.prompt.md?raw'
import { ConnectorOutputSchema } from '~/agents/schemas'
import { lookupEcgTaxonomyTool } from '~/agents/tools/lookup-ecg-taxonomy'
import { searchCorpusToolFor } from '~/agents/tools/search-corpus.server'
import { selfCritiqueTool } from '~/agents/tools/self-critique'

export interface BuildConnectorAgentOpts {
  studentId: string
}

/**
 * Build a Connector Agent bound to a single studentId. Connector + Pathfinder
 * share the identical three-tool surface (R11) — both import the same tool
 * factories. Role specialization lives entirely in `instructions` and the
 * `outputType` schema.
 */
export function buildConnectorAgent({ studentId }: BuildConnectorAgentOpts) {
  return new Agent({
    name: 'connector',
    model: CONNECTOR_MODEL,
    instructions: connectorPrompt,
    tools: [searchCorpusToolFor(studentId), lookupEcgTaxonomyTool, selfCritiqueTool],
    outputType: ConnectorOutputSchema,
  })
}
