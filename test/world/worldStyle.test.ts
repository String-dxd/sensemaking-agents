import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
  worldNightFactorForControls,
  worldTwilightFactorForControls,
} from '~/components/world/worldStyle'

describe('worldStyle time controls', () => {
  it('uses the selected hour, not the aurora toggle, as the night source of truth', () => {
    expect(
      worldNightFactorForControls(0, {
        ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
        hour: 10.5,
        aurora: true,
      }),
    ).toBe(0)

    expect(
      worldNightFactorForControls(0, {
        ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
        hour: 22,
        aurora: false,
      }),
    ).toBeGreaterThan(0)
  })

  it('derives twilight from manual hour controls', () => {
    expect(
      worldTwilightFactorForControls(0, {
        ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS,
        hour: 18.75,
      }),
    ).toBeGreaterThan(0)
  })
})
