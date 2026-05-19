import type {
  ProfileColorTokens,
  ProfileDimension,
  ProfileHeader,
} from '~/lib/profile-tokens'

export const PROFILE_DIMENSIONS: readonly ProfileDimension[]
export const DIMENSION_LABEL: Record<ProfileDimension, string>
export const PROFILE_COLORS: Record<ProfileDimension, ProfileColorTokens>
export const PROFILE_HEADERS: Record<ProfileDimension, ProfileHeader>
