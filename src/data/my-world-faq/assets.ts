import type { FaqAsset } from './types'

/**
 * U3 owns the reviewed media manifest. U2 leaves it empty rather than turning
 * unreviewed source files into publishable assets by implication.
 */
export const FAQ_ASSETS = [] as const satisfies readonly FaqAsset[]
