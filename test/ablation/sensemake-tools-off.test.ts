import { describe, expect, it } from 'vitest'
import { LOOKUP_ECG_TAXONOMY_NAME } from '~/agents/tools/lookup-ecg-taxonomy'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'
import { SELF_CRITIQUE_NAME } from '~/agents/tools/self-critique'
import { ABLATION_DIMENSIONS, buildAblationReportMarkdown } from './score'

/**
 * Sense-making tools-off ablation (R20, surface 2).
 *
 * Connector + Pathfinder run with their full three-tool surface ON or with
 * `tools: []` (model only) on the same prompt and corpus. As with the Mirror
 * ablation, v0.1 produces a Markdown scaffold for human scoring; the live
 * runner is in `scripts/ablate.ts`. The two ablations are independent —
 * running one does not affect the other's outputs. (Renamed from "cron" to
 * "sensemake" in the quiet-mirror pivot since the surface is now a manual
 * trigger button, not a cron pass.)
 */

const SENSEMAKE_SURFACE_TOOLS = [
  SEARCH_PAST_MIRRORS_NAME,
  LOOKUP_ECG_TAXONOMY_NAME,
  SELF_CRITIQUE_NAME,
] as const

describe('Sense-making tools-off ablation (R20 surface 2)', () => {
  it('the sense-making surface is exactly the three named tools', () => {
    expect(new Set(SENSEMAKE_SURFACE_TOOLS)).toEqual(
      new Set(['search_past_mirrors', 'lookup_ecg_taxonomy', 'self_critique']),
    )
  })

  it('builds a per-surface report with the five-dimension scaffold (v0.2 / U13)', () => {
    const md = buildAblationReportMarkdown({
      surface: 'sensemake',
      ranAt: '2026-05-11T20:00:00Z',
      corpusPath: 'test/ablation/fixtures/seed-multistudent.json',
      studentId: 'demo-a',
      on: { variant: 'on', rawOutput: '{"connector":{},"cartographer":{}}' },
      off: { variant: 'off', rawOutput: '{"connector":{},"cartographer":{}}' },
      notes: 'gpt-5.5 on both Connector and Cartographer',
    })
    expect(ABLATION_DIMENSIONS).toHaveLength(5)
    expect(ABLATION_DIMENSIONS).toContain('parallax_discipline')
    for (const dim of ABLATION_DIMENSIONS) {
      expect(md).toContain(dim)
    }
    const dimRowMatches = md.match(
      /\| (provenance|specificity|novelty|anti-sycophancy|parallax_discipline) \|/g,
    )
    expect(dimRowMatches?.length).toBe(5)
    expect(md).toContain('sensemake')
    expect(md).toContain('gpt-5.5')
    expect(md).toContain('demo-a')
  })

  it('omitting studentId renders the cross-student-union framing in the header', () => {
    const md = buildAblationReportMarkdown({
      surface: 'sensemake',
      ranAt: '2026-05-11T20:00:00Z',
      corpusPath: 'test/ablation/fixtures/seed-multistudent.json',
      on: { variant: 'on', rawOutput: '{}' },
      off: { variant: 'off', rawOutput: '{}' },
    })
    expect(md).toContain('cross-student union')
  })
})
