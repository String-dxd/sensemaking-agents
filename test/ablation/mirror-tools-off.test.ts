import { describe, expect, it } from 'vitest'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { ABLATION_DIMENSIONS, buildAblationReportMarkdown } from './score'

/**
 * Mirror tools-off ablation (R20, surface 1).
 *
 * The harness compares Mirror running with `tools: [search_past_mirrors]`
 * vs. `tools: []` over the same prompt sequence on the v0.2 multi-student
 * fixture corpus (3–5 students × 6–10 reflections each, U13).
 *
 * v0.2 *does not* auto-score quality — that's still K.T.D. #6. This test
 * asserts the report scaffold is produced correctly with all five rubric
 * dimensions (provenance, specificity, novelty, anti-sycophancy,
 * parallax_discipline) and that the tool the harness toggles is the one
 * Mirror exposes. Generation of the ON / OFF outputs against the live LLM
 * is gated by `OPENAI_API_KEY` and skipped here — see `scripts/ablate.ts`
 * for the runner that emits a real report under `test/ablation/reports/`.
 */

describe('Mirror tools-off ablation (R20 surface 1)', () => {
  it('Mirror exposes exactly one tool — toggling that one tool is the ablation surface', () => {
    expect(SEARCH_PAST_MIRRORS_NAME).toBe('search_past_mirrors')
  })

  it('builds a report scaffold with all five dimensions and an overall-verdict block', () => {
    const md = buildAblationReportMarkdown({
      surface: 'mirror',
      ranAt: '2026-05-11T20:00:00Z',
      corpusPath: 'test/ablation/fixtures/seed-multistudent.json',
      studentId: 'demo-a',
      on: {
        variant: 'on',
        rawOutput: '{"validation":"","inferred_meaning":"","story_reframe":""}',
      },
      off: {
        variant: 'off',
        rawOutput: '{"validation":"","inferred_meaning":"","story_reframe":""}',
      },
    })
    expect(ABLATION_DIMENSIONS).toHaveLength(5)
    expect(ABLATION_DIMENSIONS).toContain('parallax_discipline')
    for (const dim of ABLATION_DIMENSIONS) {
      expect(md).toContain(dim)
    }
    // 5 dimension rows in the scoring table + 5 lines in the per-dimension verdict block.
    const dimRowMatches = md.match(/\| (provenance|specificity|novelty|anti-sycophancy|parallax_discipline) \|/g)
    expect(dimRowMatches?.length).toBe(5)
    expect(md).toContain('Surface verdict')
    expect(md).toContain('## ON variant raw output')
    expect(md).toContain('## OFF variant raw output')
    expect(md).toContain('demo-a')
  })
})
