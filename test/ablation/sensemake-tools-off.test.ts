import { describe, expect, it } from 'vitest'
import {
  ABLATION_DIMENSIONS,
  aggregateVerifierCounters,
  buildAblationReportMarkdown,
  buildClaimIdDistribution,
} from './score'

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

describe('Sense-making tools-off ablation (R20 surface 2)', () => {
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

  it('tracks unknown canonical-claim drops without admitting invalid labels', () => {
    const rows = [
      {
        reflection_id: 1,
        student_id: 'demo-a',
        context_type: 'school',
        mirror: null,
        connector: null,
        cartographer: null,
        verifier: {
          admitted: 1,
          downgraded: 0,
          dropped_no_quote_match: 0,
          dropped_unknown_reflection: 0,
          dropped_unknown_canonical_claim_id: 1,
          aspirational: 0,
          claim_ids: ['values.contribution'],
        },
        error: null,
      },
      {
        reflection_id: 2,
        student_id: 'demo-a',
        context_type: 'hobby',
        mirror: null,
        connector: null,
        cartographer: null,
        verifier: {
          admitted: 0,
          downgraded: 1,
          dropped_no_quote_match: 0,
          dropped_unknown_reflection: 0,
          dropped_unknown_canonical_claim_id: 2,
          aspirational: 1,
          claim_ids: ['skills.communication'],
        },
        error: null,
      },
    ]

    expect(aggregateVerifierCounters(rows)?.dropped_unknown_canonical_claim_id).toBe(3)
    expect(buildClaimIdDistribution(rows)).toEqual({
      'skills.communication': 1,
      'values.contribution': 1,
    })
  })
})
