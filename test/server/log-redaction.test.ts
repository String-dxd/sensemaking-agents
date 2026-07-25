// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rejectionLogFacts, safetyLogFacts } from '~/lib/log-redaction'

describe('rejectionLogFacts', () => {
  it('reports counts and deduped reasons', () => {
    // Declared as a variable (not an inline literal) so the extra `entry`
    // field mirrors the real verifier shape without tripping TS freshness
    // checks — the helper only ever reads `reason`.
    const dropped = [
      { reason: 'no_quote_match', entry: { verbatim_quote: 'I love drawing' } },
      { reason: 'no_quote_match', entry: { verbatim_quote: 'my dad said' } },
    ]
    const downgraded = [{ canonical_claim_id: 'values.family', verbatim_quote: 'we cook together' }]

    expect(rejectionLogFacts({ mirrorEntryId: 42, dropped, downgraded })).toEqual({
      mirrorEntryId: 42,
      droppedCount: 2,
      downgradedCount: 1,
      reasons: ['no_quote_match'],
    })
  })

  it('keeps distinct reasons but never the quote text', () => {
    const marker = 'MARKER_STUDENT_QUOTE_DO_NOT_LOG'
    const dropped = [
      { reason: 'no_quote_match', entry: { verbatim_quote: marker } },
      { reason: 'unknown_reflection', entry: { verbatim_quote: `${marker} again` } },
    ]

    const facts = rejectionLogFacts({ mirrorEntryId: 7, dropped, downgraded: [] })

    expect(facts.reasons).toEqual(['no_quote_match', 'unknown_reflection'])
    expect(JSON.stringify(facts)).not.toContain(marker)
  })
})

describe('safetyLogFacts', () => {
  it('returns the match count only, never the matched text', () => {
    const facts = safetyLogFacts({ matches: ['secret text'] })

    expect(facts).toEqual({ matchCount: 1 })
    expect(JSON.stringify(facts)).not.toContain('secret text')
  })

  it('accepts the real SafetyCheckResult match shape without leaking it', () => {
    const facts = safetyLogFacts({
      matches: [
        { text: 'she is anxious', pattern: 'anxious' },
        { text: 'he has ADHD', pattern: 'ADHD' },
      ],
    })

    expect(facts).toEqual({ matchCount: 2 })
    expect(JSON.stringify(facts)).not.toContain('anxious')
  })

  it('reports zero for a clean check', () => {
    expect(safetyLogFacts({ matches: [] })).toEqual({ matchCount: 0 })
  })
})

/**
 * Source-level guard. SenseMake handles minors' reflections: `console` output
 * lands in Vercel function logs, a retention/access domain OUTSIDE the
 * Postgres RLS tenancy envelope — it is not covered by the forget/redaction
 * paths and is not deleted when a student forgets an entry.
 *
 * If this test fails, you are logging student text. The fix is never to
 * loosen the guard: route the value through `~/lib/log-redaction` and log
 * counts, IDs, dimensions, and closed-enum reasons instead.
 *
 * Coverage note: this guard only covers the files listed below. When a new
 * handler logs verifier or safety results, add it here.
 */
const GUARDED_HANDLERS = [
  'src/server/auto-connector.handler.server.ts',
  'src/server/confirm-diff.handler.server.ts',
] as const

/** Identifiers that carry student-authored text. Never log-safe. */
const FORBIDDEN_IN_LOG_ARGS: readonly [RegExp, string][] = [
  [/\bsummary\b/, 'summary (embeds verbatim quotes)'],
  [/safety\.matches/, 'safety.matches (excerpts of student identity prose)'],
  [/verbatim_quote/, 'verbatim_quote (the student’s own words)'],
]

/** Safety net so an unbalanced-looking line cannot run the span to EOF. */
const MAX_SPAN_LINES = 20

/**
 * Lines of the `console.*(...)` call starting at `startIndex`, bounded by
 * parenthesis balance. A fixed-size window is too blunt: in
 * `confirm-diff.handler.server.ts` the line right after the call assigns
 * `compiled_truth_safety_skip = { dimension, matches: safety.matches }`,
 * which is the tenant-scoped value returned to the authenticated caller —
 * in-boundary, and not something this guard should flag.
 *
 * Depth counting ignores parentheses inside string/template literals.
 */
function consoleArgSpan(lines: string[], startIndex: number): string {
  let depth = 0
  const span: string[] = []

  for (let i = startIndex; i < lines.length && i < startIndex + MAX_SPAN_LINES; i++) {
    const line = lines[i] ?? ''
    span.push(line)
    const code = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
    for (const ch of code) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    if (depth <= 0) break
  }

  return span.join('\n')
}

describe('server handlers never log student text', () => {
  for (const relPath of GUARDED_HANDLERS) {
    it(`${relPath} passes no student-authored content to console.*`, () => {
      const source = readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8')
      const lines = source.split('\n')
      const offenders: string[] = []

      lines.forEach((line, index) => {
        if (!line.includes('console.')) return
        const span = consoleArgSpan(lines, index)
        for (const [pattern, label] of FORBIDDEN_IN_LOG_ARGS) {
          if (pattern.test(span)) {
            offenders.push(`${relPath}:${index + 1} console argument span references ${label}`)
          }
        }
      })

      expect(offenders).toEqual([])
    })
  }

  it('still inspects real console sites in every guarded file', () => {
    for (const relPath of GUARDED_HANDLERS) {
      const source = readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8')
      const consoleSites = source.split('\n').filter((l) => l.includes('console.')).length
      expect(consoleSites).toBeGreaterThan(0)
    }
  })

  it('the heuristic still bites: a multi-line offending call is caught', () => {
    const offending = [
      'console.warn(',
      "  '[auto-connector] rejected',",
      '  { studentId, summary },',
      ')',
    ]
    const span = consoleArgSpan(offending, 0)
    expect(FORBIDDEN_IN_LOG_ARGS.some(([pattern]) => pattern.test(span))).toBe(true)
  })

  it('the heuristic stops at the closing paren, not N lines later', () => {
    const clean = [
      'console.warn(',
      "  '[confirm-diff] tripped',",
      ')',
      'compiled_truth_safety_skip = { dimension, matches: safety.matches }',
    ]
    const span = consoleArgSpan(clean, 0)
    expect(span).not.toContain('compiled_truth_safety_skip')
    expect(FORBIDDEN_IN_LOG_ARGS.some(([pattern]) => pattern.test(span))).toBe(false)
  })
})
