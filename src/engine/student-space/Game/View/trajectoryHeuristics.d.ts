export interface TrajectoryBearing {
  id?: string
  clusterId?: string
  title: string
  prompt: string
  traitTags?: string[]
  ecgTags?: string[]
  risk?: string
  msfUrl?: string
}

export interface TrajectoryResult {
  throughLine: string
  bearings: TrajectoryBearing[]
}

export interface IdentityLike {
  name?: string | null
}

export function trajectoryFor(profile?: unknown, identity?: IdentityLike | null): TrajectoryResult

export function claimLabelOf(id: string): string
export function clusterLabelOf(id: string): string

export function traitChipOf(id: string): {
  kicker: string
  label: string
  title: string
}

export function ecgChipOf(id: string): {
  label: string
  title: string
}
