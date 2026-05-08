import { tool } from '@openai/agents'
import { lookupEcgTaxonomy } from '~/data/ecg-taxonomy'
import {
  type LookupEcgTaxonomyInput,
  LookupEcgTaxonomyInputSchema,
  type LookupEcgTaxonomyOutput,
  LookupEcgTaxonomyOutputSchema,
} from './schemas'

export const LOOKUP_ECG_TAXONOMY_NAME = 'lookup_ecg_taxonomy'

const DESCRIPTION =
  'Look up SG-specific ECG (Education and Career Guidance) taxonomy entries — subject combinations, CCAs, post-secondary pathways, and career clusters. Always prefer this over general knowledge when the question is SG-pathway-specific.'

/** Pure handler — used by the SDK tool and by tests. */
export function executeLookupEcgTaxonomy(rawInput: unknown): LookupEcgTaxonomyOutput {
  const input = LookupEcgTaxonomyInputSchema.parse(rawInput)
  const entries = lookupEcgTaxonomy({ query: input.query, category: input.category })
  return LookupEcgTaxonomyOutputSchema.parse({ entries })
}

export const lookupEcgTaxonomyTool = tool({
  name: LOOKUP_ECG_TAXONOMY_NAME,
  description: DESCRIPTION,
  parameters: LookupEcgTaxonomyInputSchema,
  execute: async (input: LookupEcgTaxonomyInput) => {
    return JSON.stringify(executeLookupEcgTaxonomy(input))
  },
})
