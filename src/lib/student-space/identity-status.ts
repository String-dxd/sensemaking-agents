/**
 * Thin TS shim over the engine-side `statusHeuristics.js` classifier
 * (docs/plans/2026-05-19-003-feat-path-finder-cce-status-plan.md).
 *
 * The engine JS file is the source of truth for the threshold logic and
 * the audit shape; this shim re-exports its types and provides typed
 * call sites for React surfaces. When the engine hasn't booted yet (e.g.
 * a direct route hit before `StudentSpaceHost` mounted), the singleton
 * reads return null and `currentIdentityStatus()` returns null — callers
 * must render gracefully without a pill in that case.
 *
 * The shim mirrors the engine `TrajectorySheet`'s override-aware audit
 * composition: when `IdentityStatusOverride.current` is set and differs
 * from the inferred status, the returned audit reports the overridden
 * status with `isOverride: true`. React surfaces (e.g. the
 * `/library/trajectory` route's status pill) stay in lockstep with the
 * engine sheet instead of disagreeing with the floating preview HUD.
 */
// @ts-expect-error - JS module without declarations
import Captures from '~/engine/student-space/Game/State/Captures.js'
import Choices from '~/engine/student-space/Game/State/Choices.js'
import IdentityStatusOverride from '~/engine/student-space/Game/State/IdentityStatusOverride.js'
// @ts-expect-error - JS module without declarations
import Profile from '~/engine/student-space/Game/State/Profile.js'
import {
  type IdentityStatusAudit as EngineIdentityStatusAudit,
  type IdentityStatusId as EngineIdentityStatusId,
  statusFor as engineStatusFor,
  statusLabelOf as engineStatusLabelOf,
} from '~/engine/student-space/Game/View/statusHeuristics.js'

export type IdentityStatusId = EngineIdentityStatusId

/**
 * Re-exported from the engine `.d.ts` so React and engine consumers can
 * never drift on the audit shape. The override-aware shape adds two
 * optional fields that the engine layers on at composition time.
 */
export type IdentityStatusAudit = EngineIdentityStatusAudit & {
  isOverride?: boolean
  inferredStatus?: IdentityStatusId
}

/**
 * Read the current identity status from live engine singletons,
 * applying any active manual override the same way `TrajectorySheet`
 * does. Returns null if the engine hasn't booted.
 */
export function currentIdentityStatus(): IdentityStatusAudit | null {
  const profile = Profile.getInstance?.() ?? null
  const captures = Captures.getInstance?.() ?? null
  const choices = Choices.getInstance?.() ?? null
  // Profile is the load-bearing one — without facets the classifier has
  // nothing to look at. Captures + Choices may legitimately be empty.
  if (!profile) return null
  const inferred = engineStatusFor({
    facets: profile.facets,
    captures: captures?.entries ?? [],
    decisions: choices?.decisions ?? [],
    intentions: choices?.intentions ?? [],
    dominantPatternTag: choices?.dominantPatternTag?.() ?? null,
  })
  const override = IdentityStatusOverride.getInstance?.() ?? null
  const overrideId = override?.current ?? null
  if (!overrideId || overrideId === inferred.status) return inferred
  return {
    ...inferred,
    status: overrideId,
    isOverride: true,
    inferredStatus: inferred.status,
    reason:
      `Previewing as ${engineStatusLabelOf(overrideId)}. ` +
      `Inferred status from current evidence is ${engineStatusLabelOf(inferred.status)}. ` +
      inferred.reason,
  }
}

export function identityStatusLabel(id: IdentityStatusId): string {
  return engineStatusLabelOf(id)
}

/**
 * Programmatic equivalent of the floating `StatusPreviewHud` widget —
 * agents / dev consoles / tests can flip the preview status without
 * going through a DOM click. Pass `null` or `'auto'` to clear.
 */
export function setIdentityStatusOverride(
  id: IdentityStatusId | 'auto' | null,
): IdentityStatusId | null {
  return IdentityStatusOverride.getInstance?.()?.setOverride(id) ?? null
}
