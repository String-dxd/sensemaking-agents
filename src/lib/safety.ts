/**
 * Output-language guardrails — Core Principle 6 of the brainstorm:
 * "never label personality, ability, or identity." Used by Mirror,
 * Connector, and Pathfinder to assert their structured outputs do not
 * cross into diagnostic language.
 *
 * The matchers are deliberately narrow — false positives here would be
 * worse than missed catches because they'd block legitimate output. The
 * v1 plan ports the six anti-sycophancy fixtures from
 * `docs/plans/_archive/voice-wiki.md` as a stricter sweep.
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

/**
 * Extra Personality-dimension diagnostic patterns (U7 / R28+R29). The
 * Connector's compiled-truth rewrite for the Personality VIPS page is the
 * highest-risk surface for slipping into diagnostic labels — "they are
 * introverted", "they are conscientious by nature", etc. The regexes here
 * widen the base set with phrasings that the Connector specifically might
 * produce when rewriting the Personality page (third-person "they/she/he
 * is …", Big-5 label nouns, and dispositional "by nature / by temperament"
 * phrasing). Behavior-shape language stays admitted ("they sustain attention
 * longer in argument-driven tasks" passes; "they're an introvert" does not).
 */
const PERSONALITY_REWRITE_PATTERNS: RegExp[] = [
  /\b(?:they|she|he)(?:'re|'s|\s+(?:is|are))\s+(?:an?|the)\s+(?:\w+\s+)?(introvert|extrovert|perfectionist|empath|leader|follower|conscientious|neurotic|agreeable)\b/i,
  /\b(?:they|she|he)(?:'re|'s|\s+(?:is|are))\s+naturally\s+(introverted|extroverted|conscientious|neurotic|agreeable|open|empathetic)\b/i,
  /\b(?:by\s+nature|by\s+temperament|naturally\s+\w+\s+(?:by\s+(?:nature|temperament)))\b/i,
  /\b(?:their|her|his)\s+(?:true|core|authentic)\s+(?:personality|self|nature)\b/i,
]

/**
 * Personality-dimension compiled-truth rewrite check (U7). Runs the base
 * `checkOutputForDiagnosticLanguage` AND a stricter set of patterns aimed
 * at the third-person Personality-page voice. Other dimensions' rewrites
 * go through the base check only — the broader pattern set here would
 * over-trigger on the Skills page (where labelling competencies is fine).
 */
export function checkPersonalityRewriteForDiagnosticLanguage(text: string): SafetyCheckResult {
  const base = checkOutputForDiagnosticLanguage(text)
  const extra: SafetyCheckResult['matches'] = []
  for (const re of PERSONALITY_REWRITE_PATTERNS) {
    const m = re.exec(text)
    if (m) extra.push({ text: m[0], pattern: re.source })
  }
  const matches = [...base.matches, ...extra]
  return { ok: matches.length === 0, matches }
}

/**
 * Diagnostic-language gate for per-student memory writes (Step 10).
 *
 * Memory files (`/student-voice.md`, `/pedagogical-state.md`, etc.) are
 * read back into the agent's prompt on subsequent runs, so a label smuggled
 * in here would poison every downstream Mirror/Connector/Cartographer call
 * until manually purged. The bar is at least as strict as the output gate
 * (`checkOutputForDiagnosticLanguage`) because memory accumulates — a stray
 * label in `/rejected-diff-patterns.md` quoting why a previous rewrite was
 * rejected could trivially survive the base check on its surrounding
 * Connector output yet still poison the next Personality rewrite. So we use
 * the union of the base + Personality-rewrite patterns.
 */
export function checkMemoryWriteForDiagnosticLanguage(text: string): SafetyCheckResult {
  return checkPersonalityRewriteForDiagnosticLanguage(text)
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
