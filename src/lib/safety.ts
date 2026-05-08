/**
 * Output-language guardrails — Core Principle 6 of the brainstorm:
 * "never label personality, ability, or identity." Used by Mirror,
 * Connector, and Pathfinder to assert their structured outputs do not
 * cross into diagnostic language.
 *
 * The matchers are deliberately narrow — false positives here would be
 * worse than missed catches because they'd block legitimate output. The
 * v1 plan ports the six anti-sycophancy fixtures from
 * `plans/_archive/voice-wiki.md` as a stricter sweep.
 */

const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\byou\s+are\s+(an?|the)\s+(?:\w+\s+)?(introvert|extrovert|perfectionist|empath|leader|follower)\b/i,
  /\byour\s+personality\b/i,
  /\byour\s+(true|real|authentic|core)\s+(self|nature|identity)\b/i,
  /\byou\s+lack\s+(empathy|emotional|intelligence|discipline|focus)\b/i,
  /\byou\s+have\s+(low|high)\s+(emotional|cognitive|intellectual)\s+\w+/i,
  /\byou\s+were\s+born\s+to\s+\w+/i,
  /\byou\s+(should|must)\s+(become|be)\s+a[n]?\s+\w+/i,
  /\byou(?:'re|\s+are)\s+naturally\s+(gifted|talented|inclined|suited)\s+(?:for|to|towards)\b/i,
]

export interface SafetyCheckResult {
  ok: boolean
  matches: { text: string; pattern: string }[]
}

export function checkOutputForDiagnosticLanguage(text: string): SafetyCheckResult {
  const matches: { text: string; pattern: string }[] = []
  for (const re of DIAGNOSTIC_PATTERNS) {
    const m = re.exec(text)
    if (m) matches.push({ text: m[0], pattern: re.source })
  }
  return { ok: matches.length === 0, matches }
}

/**
 * Walks an arbitrary structured payload and runs `checkOutputForDiagnosticLanguage`
 * on every string leaf. Used by `safety.test.ts` against full agent
 * outputs.
 */
export function checkPayloadForDiagnosticLanguage(payload: unknown): SafetyCheckResult {
  const matches: SafetyCheckResult['matches'] = []
  walk(payload, (text) => {
    const result = checkOutputForDiagnosticLanguage(text)
    matches.push(...result.matches)
  })
  return { ok: matches.length === 0, matches }
}

function walk(value: unknown, onString: (text: string) => void): void {
  if (typeof value === 'string') {
    onString(value)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, onString)
    return
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) walk(v, onString)
  }
}
