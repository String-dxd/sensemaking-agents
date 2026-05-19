export const SGT_OFFSET_MINUTES: number

export function getSgYearBoundary(year: number): string
export function bucketYearForTimestamp(iso: string): number
export function yearsCoveringActivity(timestamps: readonly string[]): number[]
export function yearRangeSgt(year: number): { startIso: string; endIso: string }
export function endOfSgtYearIso(year: number): string
