import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FaqConflictDialog } from '~/components/my-world-faq/editor/FaqConflictDialog'
import type { MyWorldFaqEditorialFieldComparison } from '~/data/my-world-faq'

const comparisons: MyWorldFaqEditorialFieldComparison[] = [
  {
    path: 'page.hero.heading',
    status: 'overlap',
    baseValue: 'Original heading',
    localValue: 'My heading',
    latestValue: 'Live heading',
  },
  {
    path: 'route.description',
    status: 'local-only',
    baseValue: 'Original description',
    localValue: 'My description',
    latestValue: 'Original description',
  },
]

describe('FaqConflictDialog', () => {
  it('identifies each copy action by its source and field path', () => {
    render(
      <FaqConflictDialog
        open
        kind="stale"
        comparisons={comparisons}
        liveVersion={5}
        onKeepDraft={vi.fn()}
        onStartFromLive={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Version 5 changed while you were editing',
    })

    expect(
      within(dialog).getByRole('button', {
        name: 'Copy my draft for page.hero.heading',
      }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', {
        name: 'Copy live for page.hero.heading',
      }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', {
        name: 'Copy my draft for route.description',
      }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', {
        name: 'Copy live for route.description',
      }),
    ).toBeInTheDocument()
  })
})
