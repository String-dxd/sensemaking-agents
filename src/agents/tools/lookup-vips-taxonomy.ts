import { tool } from '@openai/agents'
import { lookupVipsTaxonomy } from '~/data/vips-taxonomy'
import {
  type VipsTaxonomyInput,
  VipsTaxonomyInputSchema,
  type VipsTaxonomyOutput,
  VipsTaxonomyOutputSchema,
} from './schemas'

export const LOOKUP_VIPS_TAXONOMY_NAME = 'lookup_vips_taxonomy'

const DESCRIPTION =
  'Look up canonical VIPS (Values, Interests, Personality, Skills) taxonomy entries — definitions and counsellor-recognizable behavioral indicators. Always prefer this over free-text claim labels when proposing or referencing a VIPS sub-dimension; the IDs are the canonical vocabulary.'

/** Pure handler — used by the SDK tool and by tests. */
export function executeLookupVipsTaxonomy(rawInput: unknown): VipsTaxonomyOutput {
  const input = VipsTaxonomyInputSchema.parse(rawInput)
  const entries = lookupVipsTaxonomy({ query: input.query, dimension: input.dimension })
  return VipsTaxonomyOutputSchema.parse({ entries })
}

export const lookupVipsTaxonomyTool = tool({
  name: LOOKUP_VIPS_TAXONOMY_NAME,
  description: DESCRIPTION,
  parameters: VipsTaxonomyInputSchema,
  execute: async (input: VipsTaxonomyInput) => {
    return JSON.stringify(executeLookupVipsTaxonomy(input))
  },
})
