import { type SelfCritiqueOutput, SelfCritiqueOutputSchema } from '~/agents/tools/schemas'
import { Badge } from '~/components/ui/badge'

export function parseMirrorEvalReview(rawOutputJson: string): SelfCritiqueOutput | null {
  try {
    const raw = JSON.parse(rawOutputJson) as unknown
    if (!isRecord(raw) || !('eval_review' in raw) || raw.eval_review == null) return null
    const parsed = SelfCritiqueOutputSchema.safeParse(raw.eval_review)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function MirrorEvalReviewBadge({ review }: { review: SelfCritiqueOutput | null }) {
  if (!review) return null
  const verdict = review.verdict ?? 'pass_with_warnings'
  const risk = review.risk_level ?? 'medium'
  return (
    <Badge
      variant={verdict === 'fail' || risk === 'high' ? 'warning' : 'secondary'}
      size="sm"
      radius="sm"
      data-testid="mirror-eval-badge"
    >
      self-critique: {verdict}/{risk}
    </Badge>
  )
}

export function MirrorEvalReviewPanel({
  review,
  showEmpty = false,
}: {
  review: SelfCritiqueOutput | null
  showEmpty?: boolean
}) {
  if (!review && !showEmpty) return null

  if (!review) {
    return (
      <details
        className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs"
        data-testid="mirror-eval-metadata"
      >
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Self-critique metadata
        </summary>
        <p className="mt-2 text-muted-foreground">
          No self-critique review was recorded for this mirror entry.
        </p>
      </details>
    )
  }

  const verdict = review.verdict ?? 'pass_with_warnings'
  const risk = review.risk_level ?? 'medium'
  return (
    <details
      className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs"
      data-testid="mirror-eval-metadata"
    >
      <summary className="cursor-pointer font-medium text-muted-foreground">
        Self-critique metadata
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={verdict === 'fail' || risk === 'high' ? 'warning' : 'secondary'}
            size="sm"
            radius="sm"
          >
            {verdict}
          </Badge>
          <Badge variant={risk === 'high' ? 'warning' : 'outline'} size="sm" radius="sm">
            {risk} risk
          </Badge>
          <Badge variant="outline" size="sm" radius="sm">
            {review.confidence} confidence
          </Badge>
        </div>
        <p className="leading-relaxed text-foreground">{review.critique}</p>
        {review.findings?.length ? (
          <ul className="flex flex-col gap-2">
            {review.findings.map((finding) => (
              <li
                key={`${finding.category}-${finding.severity}-${finding.issue}`}
                className="leading-relaxed"
              >
                <span className="font-medium text-foreground">
                  {finding.category} / {finding.severity}:
                </span>{' '}
                <span className="text-muted-foreground">{finding.issue}</span>{' '}
                <span className="text-foreground">{finding.recommendation}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {review.suggestions.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {review.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
