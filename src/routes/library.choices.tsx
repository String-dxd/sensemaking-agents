/**
 * `/library/choices` — Choices profile tab page.
 *
 * Data is engine-side + locally persisted. No server fetch required.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  type ChangeIntention,
  type ChoicesActions,
  ChoicesPageView,
  type DecisionEntry,
  type DecisionPatternTag,
} from '~/components/ChoicesPageView'
import type { SheetKey } from '~/components/SheetEntryRail'
import { Button } from '~/components/ui/button'
import { isVipsDimension } from '~/data/vips-taxonomy'
import { bootProfileTabSlices, useEngineSlice } from '~/lib/student-space/profile-tab-state'

const STUDENT_ID = 'me'

export const Route = createFileRoute('/library/choices')({
  component: ChoicesPage,
})

function ChoicesPage() {
  const navigate = useNavigate()
  const slices = bootProfileTabSlices()
  const choices = useEngineSlice(slices?.choices ?? null)

  const decisions = (choices?.listDecisions() ?? []) as DecisionEntry[]
  const intentions = (choices?.listIntentions() ?? []) as ChangeIntention[]

  const actions: ChoicesActions = {
    addDecision: (p) => (choices?.addDecision(p) as DecisionEntry | null) ?? null,
    removeDecision: (id) => choices?.removeDecision(id) ?? null,
    tagDecisionPattern: (id, tag) =>
      (choices?.tagDecisionPattern(id, tag) as DecisionEntry | null) ?? null,
    addChangeIntention: (p) => (choices?.addChangeIntention(p) as ChangeIntention | null) ?? null,
    removeChangeIntention: (id) => choices?.removeChangeIntention(id) ?? null,
  }

  return (
    <section className="flex flex-col gap-4 py-2">
      <PageBackLink />
      <ChoicesPageView
        studentId={STUDENT_ID}
        openSheet="choices"
        onOpenSheet={(key: SheetKey) => {
          if (key === 'choices') return
          if (key === 'relationships') {
            void navigate({ to: '/library/relationships' })
            return
          }
          if (typeof key === 'string' && isVipsDimension(key)) {
            void navigate({ to: '/library/$dimension', params: { dimension: key } })
          }
        }}
        decisions={decisions}
        intentions={intentions}
        actions={actions}
      />
      <div>
        <Link to="/" className="w-fit">
          <Button variant="outline" size="sm">
            Back to island
          </Button>
        </Link>
      </div>
    </section>
  )
}

function PageBackLink() {
  return (
    <Link to="/" className="w-fit text-xs font-medium text-muted-foreground hover:text-foreground">
      ← Island
    </Link>
  )
}

// Type assertion helper used internally — keeps TS happy when the slice's
// .js exports are typed as `unknown` at the boundary.
export type { DecisionPatternTag }
