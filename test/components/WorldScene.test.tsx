import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldSceneHandle } from '~/components/world/createWorldScene'

const cleanup = vi.fn()
const resetCamera = vi.fn()
const restoreCamera = vi.fn()
const updateEnvironmentControls = vi.fn()
const zoomBy = vi.fn()
const createWorldSceneMock = vi.fn(
  (_options: unknown): WorldSceneHandle => ({
    renderNow: vi.fn(),
    resetCamera,
    restoreCamera,
    updateEnvironmentControls,
    zoomBy,
    dispose: cleanup,
  }),
)

vi.mock('~/components/world/createWorldScene', () => ({
  createWorldScene: (options: unknown) => createWorldSceneMock(options),
}))

import { APPROVED_STUDENT_SPACE_ASSET_URLS, WORLD_ASSETS } from '~/components/world/assets'
import { WorldScene } from '~/components/world/WorldScene'
import { DEFAULT_WORLD_ENVIRONMENT_CONTROLS } from '~/components/world/worldStyle'

beforeEach(() => {
  createWorldSceneMock.mockClear()
  cleanup.mockClear()
  resetCamera.mockClear()
  restoreCamera.mockClear()
  updateEnvironmentControls.mockClear()
  zoomBy.mockClear()
  vi.useRealTimers()
})

describe('WorldScene', () => {
  it('keeps approved student-space assets behind public world URLs', () => {
    expect(APPROVED_STUDENT_SPACE_ASSET_URLS).toEqual([
      '/world/trees/oakTreesVisual.glb',
      '/world/trees/cherryTreesVisual.glb',
      '/world/trees/foliageSDF.png',
    ])
    for (const url of APPROVED_STUDENT_SPACE_ASSET_URLS) {
      expect(url).not.toMatch(/student-space-v1\/sources|tmp|Users/)
    }
    expect(WORLD_ASSETS.trees.oak.source).toBe('student-space-v1/public/trees/oakTreesVisual.glb')
    expect(WORLD_ASSETS.recipes.butterflies.source).toBe(
      'student-space-v1/sources/Game/View/Butterflies.js',
    )
    expect(WORLD_ASSETS.recipes.island.adapts).toContain('TinySkies ocean caustics')
    expect(WORLD_ASSETS.recipes.grass.source).toContain(
      'student-space-v1/sources/Game/View/Materials/shaders/grass/vertex.glsl',
    )
    expect(WORLD_ASSETS.recipes.foliageCluster.adapts).toContain('GLB body texture sampling')
    expect(WORLD_ASSETS.recipes.fruitBushes.usage).toBe('adapted-student-space-recipe')
    expect(WORLD_ASSETS.recipes.fruitBushes.adapts).toContain('tree leaf-cloud shrub bodies')
    expect(WORLD_ASSETS.recipes.weatherScene.source).toContain(
      'student-space-v1/sources/Game/State/DayCycle.js',
    )
    expect(WORLD_ASSETS.recipes.weatherScene.source).toContain(
      'student-space-v1/sources/Game/View/HourHud.js',
    )
    expect(WORLD_ASSETS.recipes.weatherScene.adapts).toContain('haze rays')
    expect(WORLD_ASSETS.recipes.cameraControls.source).toContain(
      'student-space-v1/sources/Game/View/Camera.js',
    )
    expect(WORLD_ASSETS.recipes.cameraControls.source).toContain(
      'student-space-v1/sources/Game/View/HoverProbe.js',
    )
    expect(WORLD_ASSETS.recipes.cameraControls.source).toContain(
      'student-space-v1/sources/Game/View/KiraNarrator.js',
    )
    expect(WORLD_ASSETS.recipes.cameraControls.adapts).toContain('hover ground ring')
    expect(WORLD_ASSETS.recipes.mailbox.source).toContain(
      'student-space-v1/sources/Game/View/Mailbox.js',
    )
    expect(WORLD_ASSETS.recipes.mailbox.source).toContain(
      'student-space-v1/sources/Game/View/LettersSheet.js',
    )
    expect(WORLD_ASSETS.recipes.moodPins.adapts).toContain('mood markers')
    expect(WORLD_ASSETS.recipes.stars.source).toContain('StarsMaterial.js')
    expect(WORLD_ASSETS.recipes.ambientFireflies.source).toBe(
      'student-space-v1/sources/Game/View/Fireflies.js',
    )
    expect(WORLD_ASSETS.recipes.excludedProductLayers.adapts).toContain('TrackPicker')
  })

  it('initializes the Three scene when mounted', async () => {
    render(<WorldScene />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('world-scene-host')).toHaveAttribute(
      'data-world-scene-state',
      'mounted',
    )
  })

  it('cleans up the scene on unmount', async () => {
    const { unmount } = render(<WorldScene />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('pushes environment control changes into the mounted scene', async () => {
    const controls = { ...DEFAULT_WORLD_ENVIRONMENT_CONTROLS, hour: 10.5 }
    const { rerender } = render(<WorldScene environmentControls={controls} />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    const nextControls = { ...controls, rainbow: true }
    rerender(<WorldScene environmentControls={nextControls} />)

    await waitFor(() => expect(updateEnvironmentControls).toHaveBeenCalledWith(nextControls))
  })

  it('keeps the mounted Three scene when interaction callbacks change', async () => {
    const { rerender } = render(<WorldScene onWorldInteraction={vi.fn()} />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    rerender(<WorldScene onWorldInteraction={vi.fn()} />)

    expect(createWorldSceneMock).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('exposes Student Space-style camera zoom and reset controls', async () => {
    render(<WorldScene />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    screen.getByRole('button', { name: 'Zoom in' }).click()
    screen.getByRole('button', { name: 'Zoom out' }).click()
    screen.getByRole('button', { name: 'Reset view' }).click()

    expect(zoomBy).toHaveBeenNthCalledWith(1, 0.85)
    expect(zoomBy).toHaveBeenNthCalledWith(2, 1 / 0.85)
    expect(resetCamera).toHaveBeenCalledTimes(1)
  })

  it('shows hotspot metadata surfaced by the Three scene', async () => {
    render(<WorldScene />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    const options = createWorldSceneMock.mock.calls[0]?.[0] as {
      onHotspotHover?: (hotspot: unknown, pointer?: { x: number; y: number }) => void
    }
    act(() => {
      options.onHotspotHover?.(
        {
          id: 'tree-values.achievement',
          kind: 'value',
          eyebrow: 'Value tree',
          title: 'Achievement',
          description: '2 entries · high signal',
          href: '/library/values#entry-1',
        },
        { x: 120, y: 80 },
      )
    })

    expect(screen.getByTestId('world-hotspot-tooltip')).toHaveAttribute(
      'data-hotspot-kind',
      'value',
    )
    expect(screen.getByText('Achievement')).toBeInTheDocument()
    expect(screen.getByText('2 entries · high signal')).toBeInTheDocument()
  })

  it('routes prompt bird selection through the Kira-style narration handoff', async () => {
    const onVoicePromptSelect = vi.fn()
    render(<WorldScene onVoicePromptSelect={onVoicePromptSelect} />)
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    const options = createWorldSceneMock.mock.calls[0]?.[0] as {
      onHotspotSelect?: (hotspot: unknown) => void
    }
    act(() => {
      options.onHotspotSelect?.({
        id: 'voice-prompt-bird',
        kind: 'prompt',
        eyebrow: 'Prompt bird',
        title: "What's on your mind right now?",
        description: 'Click to answer by voice.',
        action: 'voice',
      })
    })

    expect(screen.getByTestId('world-narration')).toHaveAttribute('data-hotspot-kind', 'prompt')
    act(() => {
      screen.getByRole('button', { name: /talk to me/i }).click()
    })

    await waitFor(() => expect(onVoicePromptSelect).toHaveBeenCalledTimes(1))
    expect(restoreCamera).toHaveBeenCalledTimes(1)
  })

  it('lets the route layer handle hotspot navigation after narration confirm', async () => {
    const onHotspotNavigate = vi.fn()
    const onWorldInteraction = vi.fn()
    render(
      <WorldScene onHotspotNavigate={onHotspotNavigate} onWorldInteraction={onWorldInteraction} />,
    )
    await waitFor(() => expect(createWorldSceneMock).toHaveBeenCalledTimes(1))

    const options = createWorldSceneMock.mock.calls[0]?.[0] as {
      onHotspotSelect?: (hotspot: unknown) => void
    }
    const hotspot = {
      id: 'tree-values.achievement',
      kind: 'value',
      eyebrow: 'Value tree',
      title: 'Achievement',
      description: '2 entries · high signal',
      href: '/?sheet=values#entry-1',
    }
    act(() => {
      options.onHotspotSelect?.(hotspot)
    })

    expect(screen.getByTestId('world-narration')).toHaveAttribute('data-hotspot-kind', 'value')
    act(() => {
      screen.getByRole('button', { name: /show me/i }).click()
    })

    await waitFor(() =>
      expect(onHotspotNavigate).toHaveBeenCalledWith('/?sheet=values#entry-1', hotspot),
    )
    expect(onWorldInteraction).toHaveBeenCalledWith({ type: 'hotspot-select', hotspot })
    expect(onWorldInteraction).toHaveBeenCalledWith({ type: 'narration-open', hotspot })
    expect(onWorldInteraction).toHaveBeenCalledWith({ type: 'narration-confirm', hotspot })
  })

  it('renders an accessible fallback if scene creation fails', async () => {
    createWorldSceneMock.mockImplementationOnce(() => {
      throw new Error('no webgl')
    })
    render(<WorldScene />)
    expect(await screen.findByTestId('world-scene-fallback')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /quiet island map/i })).toBeInTheDocument()
  })
})
