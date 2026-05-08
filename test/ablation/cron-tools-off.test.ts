import { describe, expect, it } from 'vitest'
import { LOOKUP_ECG_TAXONOMY_NAME } from '~/agents/tools/lookup-ecg-taxonomy'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { SELF_CRITIQUE_NAME } from '~/agents/tools/self-critique'
import { ABLATION_DIMENSIONS, buildAblationReportMarkdown } from './score'

/**
 * Cron tools-off ablation (R19, surface 2).
 *
 * Connector + Pathfinder run with their full three-tool surface ON or with
 * `tools: []` (model only) on the same prompt and corpus. As with the
 * Mirror ablation, v0.1 produces a Markdown scaffold for human scoring;
 * the live runner is in `scripts/ablate.ts`. The two ablations are
 * independent — running one does not affect the other's outputs.
 */

const CRON_SURFACE_TOOLS = [
  SEARCH_PAST_MIRRORS_NAME,
  LOOKUP_ECG_TAXONOMY_NAME,
  SELF_CRITIQUE_NAME,
] as const

describe('Cron tools-off ablation (AE4 surface 2)', () => {
  it('the cron surface is exactly the three named tools (R11 — identical surface)', () => {
    expect(new Set(CRON_SURFACE_TOOLS)).toEqual(
      new Set(['search_past_mirrors', 'lookup_ecg_taxonomy', 'self_critique']),
    )
  })

  it('builds a per-surface report with the four-dimension scaffold', () => {
    const md = buildAblationReportMarkdown({
      surface: 'cron',
      ranAt: '2026-05-08T20:00:00Z',
      corpusPath: 'test/ablation/fixtures/seed-corpus.json',
      on: { variant: 'on', rawOutput: '{"connector":{},"pathfinder":{}}' },
      off: { variant: 'off', rawOutput: '{"connector":{},"pathfinder":{}}' },
      notes: 'gpt-4.1 on both Connector and Pathfinder',
    })
    for (const dim of ABLATION_DIMENSIONS) {
      expect(md).toContain(dim)
    }
    expect(md).toContain('cron')
    expect(md).toContain('gpt-4.1')
  })
})
