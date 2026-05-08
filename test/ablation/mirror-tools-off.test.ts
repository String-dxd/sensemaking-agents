import { describe, expect, it } from 'vitest'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { ABLATION_DIMENSIONS, buildAblationReportMarkdown } from './score'

/**
 * Mirror tools-off ablation (R20, surface 1).
 *
 * The harness compares Mirror running with `tools: [search_past_mirrors]`
 * vs. `tools: []` over the same prompt sequence on the same 8-reflection
 * fixture corpus.
 *
 * v0.1 *does not* auto-score quality — that's K.T.D. #6 of the prior plan.
 * This test asserts the report scaffold is produced correctly and that the
 * tool the harness toggles is the one Mirror exposes. Generation of the
 * ON / OFF outputs against the live LLM is gated by `OPENAI_API_KEY` and
 * skipped here — see `scripts/ablate.ts` for the runner that emits a real
 * report under `test/ablation/reports/`.
 */

describe('Mirror tools-off ablation (R20 surface 1)', () => {
  it('Mirror exposes exactly one tool — toggling that one tool is the ablation surface', () => {
    expect(SEARCH_PAST_MIRRORS_NAME).toBe('search_past_mirrors')
  })

  it('builds a report scaffold with all four dimensions and an overall-verdict block', () => {
    const md = buildAblationReportMarkdown({
      surface: 'mirror',
      ranAt: '2026-05-08T20:00:00Z',
      corpusPath: 'test/ablation/fixtures/seed-corpus.json',
      on: {
        variant: 'on',
        rawOutput: '{"validation":"","inferred_meaning":"","story_reframe":""}',
      },
      off: {
        variant: 'off',
        rawOutput: '{"validation":"","inferred_meaning":"","story_reframe":""}',
      },
    })
    for (const dim of ABLATION_DIMENSIONS) {
      expect(md).toContain(dim)
    }
    expect(md).toContain('Surface verdict')
    expect(md).toContain('## ON variant raw output')
    expect(md).toContain('## OFF variant raw output')
  })
})
