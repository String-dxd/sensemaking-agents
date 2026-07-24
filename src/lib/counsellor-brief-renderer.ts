/**
 * U12 — Counsellor brief markdown side-export (pure renderer).
 *
 * Given already-loaded VIPS pages + per-dimension non-forgotten timeline
 * entries + the latest Cartographer Trajectory (or null), produce a single
 * plain-markdown string suitable for a `Blob`-based file download. The
 * function is intentionally pure: no DB calls, no fetches, no `Date.now()`
 * outside the explicit header date — so it is trivially testable and reusable
 * by a future CLI export script.
 *
 * Scope per R22 and the U12 Approach: this is a developer/demo debugging
 * artifact in v0.2; the final markdown shape lands here against a render of
 * the seed. No counsellor portal, no per-school styling.
 *
 * Voice rules (R29) carried into markdown:
 *   - Values cite evidence (verbatim quote-based)
 *   - Interests use behaviour-shape RIASEC language (already on the page)
 *   - Personality: no diagnostic labels — the Personality compiled_truth runs
 *     through `checkPersonalityRewriteForDiagnosticLanguage` before render;
 *     if flagged, the compiled_truth is replaced with a withheld-pending-review
 *     line. The timeline quotes are direct student speech and are NOT subject
 *     to that guardrail.
 *   - Skills: "competencies practiced" framing (already on the page)
 *
 * Markdown safety: verbatim quotes flow into `>` blockquote lines and into
 * the compiled-truth paragraph. Any markdown special characters in those
 * student-authored strings are escaped through `escapeForMarkdownBlockquote`
 * so the rendered output is valid markdown.
 *
 * Forgotten exclusion (R19): the caller is responsible for excluding
 * forgotten timeline entries before passing them in. The renderer trusts the
 * caller — it neither inspects `forgotten_at` nor calls back into the DB.
 */

import type { CartographerOutputDraft } from '~/agents/schemas'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import type { VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
import { sgToday } from '~/lib/entry-date'
import { checkPersonalityRewriteForDiagnosticLanguage } from '~/lib/safety'

const DIMENSION_HEADING: Record<VipsDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

/** Top-K cap for per-dimension verbatim quotes — see U12 Approach "top-3 rule". */
const TOP_K_QUOTES = 3
/** Top-K cap for pathways in the Trajectory section. */
const TOP_K_PATHWAYS = 3

export interface RenderCounsellorBriefInput {
  studentId: string
  pages: VipsPageRow[]
  /** Non-forgotten entries, keyed by dimension. Caller is responsible for the R19 exclusion. */
  timelineByDimension: Record<VipsDimension, VipsTimelineEntryRow[]>
  /** Latest Cartographer Trajectory; `null` when no run has been performed yet. */
  trajectory: CartographerOutputDraft | null
  /**
   * Optional override for the header date (YYYY-MM-DD). Defaults to today
   * in Asia/Singapore. Exposed so tests can pin a stable date without
   * mocking `Date`.
   */
  today?: string
}

export function renderCounsellorBrief(input: RenderCounsellorBriefInput): string {
  const today = input.today ?? sgToday()
  const pagesByDimension = indexPagesByDimension(input.pages)
  const sections: string[] = []

  sections.push(`# Counsellor Brief — ${input.studentId} — ${today}`)

  for (const dim of VIPS_DIMENSIONS) {
    sections.push(
      renderDimensionSection(dim, pagesByDimension.get(dim), input.timelineByDimension[dim] ?? []),
    )
  }

  sections.push(renderTrajectorySection(input.trajectory))
  sections.push(renderOpenQuestionsSection(input.pages, input.trajectory))
  sections.push(renderDisclaimerSection(input.trajectory))
  sections.push(
    `---\n\n*Developer/demo debugging artifact. Not a versioned brief. Generated ${today}.*`,
  )

  // Join with blank lines so each `##` section stands cleanly on its own.
  return `${sections.join('\n\n')}\n`
}

// ── section renderers ────────────────────────────────────────────────────

function renderDimensionSection(
  dim: VipsDimension,
  page: VipsPageRow | undefined,
  entries: VipsTimelineEntryRow[],
): string {
  const lines: string[] = []
  lines.push(`## ${DIMENSION_HEADING[dim]}`)

  // Compiled truth: Personality runs through the diagnostic-language guard.
  const rawCompiled = (page?.compiled_truth ?? '').trim()
  let compiledTruth = rawCompiled
  if (dim === 'personality' && rawCompiled.length > 0) {
    const check = checkPersonalityRewriteForDiagnosticLanguage(rawCompiled)
    if (!check.ok) {
      compiledTruth = '_Personality summary withheld pending review._'
    }
  }

  if (compiledTruth.length === 0) {
    // No compiled-truth row at all (or blank stub) — emit a thin placeholder
    // rather than nothing so the section reads coherently when the dimension
    // has never been refined.
    lines.push('_No compiled summary yet._')
  } else {
    lines.push(compiledTruth)
  }

  // Top-3 entries newest-first by `committed_at`. Note: the DB returns
  // entries already sorted DESC by `committed_at` (see `listVipsTimelineEntries`),
  // so the explicit sort here is defensive — it lets us test the renderer in
  // isolation with arbitrarily-ordered fixtures.
  if (entries.length === 0) {
    lines.push(`_No verified claims yet for ${dim}._`)
  } else {
    const topK = [...entries]
      .sort((a, b) =>
        a.committed_at < b.committed_at ? 1 : a.committed_at > b.committed_at ? -1 : 0,
      )
      .slice(0, TOP_K_QUOTES)
    for (const entry of topK) {
      lines.push(renderQuoteLine(entry))
    }
  }

  return lines.join('\n\n')
}

function renderQuoteLine(entry: VipsTimelineEntryRow): string {
  const safe = escapeForMarkdownBlockquote(entry.verbatim_quote)
  return `> "${safe}" — ${entry.strength} strength`
}

function renderTrajectorySection(trajectory: CartographerOutputDraft | null): string {
  if (trajectory === null) {
    return '## Trajectory\n\n_Trajectory not yet generated — run sense-making to populate._'
  }
  const lines: string[] = []
  lines.push('## Trajectory')
  lines.push(trajectory.trajectory_paragraph)

  const topPathways = trajectory.pathways.slice(0, TOP_K_PATHWAYS)
  if (topPathways.length > 0) {
    lines.push('### Top pathways')
    const bullets = topPathways.map((p) => {
      return `- **${p.label}** — ${p.risks_tradeoffs} *Explore:* ${p.exploration_prompt}`
    })
    lines.push(bullets.join('\n'))
  }

  return lines.join('\n\n')
}

function renderOpenQuestionsSection(
  pages: VipsPageRow[],
  trajectory: CartographerOutputDraft | null,
): string {
  const lines: string[] = []
  lines.push('## Open questions')

  // VIPS-page open questions first, then trajectory open questions; dedup
  // case-insensitively and preserve original order. The renderer ignores
  // blank strings so a stub page (no upserted row yet) does not produce an
  // empty bullet.
  const collected: string[] = []
  for (const page of pages) {
    const q = page.open_question.trim()
    if (q.length > 0) collected.push(q)
  }
  if (trajectory) {
    for (const q of trajectory.open_questions) {
      const trimmed = q.trim()
      if (trimmed.length > 0) collected.push(trimmed)
    }
  }

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const q of collected) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(q)
  }

  if (deduped.length === 0) {
    lines.push('_No open questions yet._')
  } else {
    lines.push(deduped.map((q) => `- ${q}`).join('\n'))
  }

  return lines.join('\n\n')
}

function renderDisclaimerSection(trajectory: CartographerOutputDraft | null): string {
  if (trajectory === null) {
    // The "Trajectory not yet generated" placeholder section already absorbs
    // the disclaimer concern — emit a thin placeholder so the section header
    // still appears for layout consistency, but acknowledge the gap.
    return '## Disclaimer\n\n_Disclaimer will appear once sense-making has been run._'
  }
  return `## Disclaimer\n\n${trajectory.disclaimer}`
}

// ── helpers ──────────────────────────────────────────────────────────────

function indexPagesByDimension(pages: VipsPageRow[]): Map<VipsDimension, VipsPageRow> {
  const m = new Map<VipsDimension, VipsPageRow>()
  for (const page of pages) {
    // Page rows come from the DB with `dimension: string`; cast to the closed
    // enum since the upstream CHECK constraint already enforces membership.
    m.set(page.dimension as VipsDimension, page)
  }
  return m
}

/**
 * Escape student-authored verbatim quotes so they render safely inside a
 * markdown blockquote line of the form `> "..." — strength badge`.
 *
 * The escape set is deliberately narrow — we only neutralize markdown
 * formatting chars that would visibly distort the rendered blockquote:
 *   - `\` first (backslash itself, so it doesn't double-escape later)
 *   - `*` and `_` (bold/italic)
 *   - `` ` `` (inline code)
 *   - `[` and `]` (link syntax)
 *   - `(` and `)` (image/link target parens — without these an `![alt](url)`
 *     payload inside a student utterance could render as an image)
 *   - `!` (image-link prefix, paired with the bracket/paren escapes)
 *   - `>` (would start a nested blockquote when on a continuation line)
 *   - `"` (terminates our quote wrapper)
 *
 * Newlines collapse to spaces so a multi-line student utterance still
 * renders on a single blockquote line; otherwise the second line would
 * escape the `>` prefix and break the quote visually.
 */
export function escapeForMarkdownBlockquote(s: string): string {
  return s
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]()!>"])/g, '\\$1')
}
