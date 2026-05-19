/**
 * Thin TS shim over the engine-side `statusHeuristics.js` classifier
 * (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * The engine JS file is the source of truth for the threshold logic; this
 * shim only provides typed call sites for React surfaces that want to read
 * the same audit shape. When the engine hasn't booted yet (e.g. the React
 * route was opened cold without `StudentSpaceHost` mounting first), the
 * singleton reads return null and `currentIdentityStatus()` returns null —
 * callers must render gracefully without a pill in that case.
 */
// @ts-expect-error - JS module without declarations
import Captures from '~/engine/student-space/Game/State/Captures.js'
import Choices from '~/engine/student-space/Game/State/Choices.js'
// @ts-expect-error - JS module without declarations
import Profile from '~/engine/student-space/Game/State/Profile.js'
import {
  statusFor as engineStatusFor,
  statusLabelOf as engineStatusLabelOf,
} from '~/engine/student-space/Game/View/statusHeuristics.js'

export type IdentityStatusId = 'starter' | 'diffused' | 'searching' | 'foreclosed' | 'achieved'

export interface IdentityStatusAudit {
  status: IdentityStatusId
  exploration: {
    score: number
    band: 'low' | 'emerging' | 'high'
    inputs: {
      distinctClaims: number
      weightedQuotes: number
      askCount: number
      hasBackendCartographer: boolean
    }
  }
  commitment: {
    score: number
    band: 'low' | 'high'
    inputs: {
      decisionCount: number
      intentionCount: number
      dominantPatternTag: string | null
    }
  }
  reason: string
}

/**
 * Read the current identity status from live engine singletons.
 * Returns null if the engine hasn't booted (e.g. direct route hit before
 * `StudentSpaceHost` has mounted on this page).
 */
export function currentIdentityStatus(): IdentityStatusAudit | null {
  const profile = Profile.getInstance?.() ?? null
  const captures = Captures.getInstance?.() ?? null
  const choices = Choices.getInstance?.() ?? null
  // Profile is the load-bearing one — without facets the classifier has
  // nothing to look at. Captures + Choices may legitimately be empty.
  if (!profile) return null
  return engineStatusFor({
    facets: profile.facets,
    captures: captures?.entries ?? [],
    decisions: choices?.decisions ?? [],
    intentions: choices?.intentions ?? [],
    dominantPatternTag: choices?.dominantPatternTag?.() ?? null,
  }) as IdentityStatusAudit
}

export function identityStatusLabel(id: IdentityStatusId): string {
  return engineStatusLabelOf(id) as string
}
