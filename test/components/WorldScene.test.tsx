import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldSceneHandle } from '~/components/world/createWorldScene'

const cleanup = vi.fn()
const createWorldSceneMock = vi.fn(
  (_options: unknown): WorldSceneHandle => ({
    renderNow: vi.fn(),
    dispose: cleanup,
  }),
)

vi.mock('~/components/world/createWorldScene', () => ({
  createWorldScene: (options: unknown) => createWorldSceneMock(options),
}))

import { APPROVED_STUDENT_SPACE_ASSET_URLS, WORLD_ASSETS } from '~/components/world/assets'
import { WorldScene } from '~/components/world/WorldScene'

beforeEach(() => {
  createWorldSceneMock.mockClear()
  cleanup.mockClear()
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

  it('renders an accessible fallback if scene creation fails', async () => {
    createWorldSceneMock.mockImplementationOnce(() => {
      throw new Error('no webgl')
    })
    render(<WorldScene />)
    expect(await screen.findByTestId('world-scene-fallback')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /quiet island map/i })).toBeInTheDocument()
  })
})
