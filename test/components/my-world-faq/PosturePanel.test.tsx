import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PosturePanel } from '~/components/my-world-faq/PosturePanel'
import { DEFAULT_MY_WORLD_FAQ_CONTENT } from '~/data/my-world-faq'

describe('PosturePanel', () => {
  afterEach(cleanup)

  it('falls back to compiled copy for a historical public document', () => {
    const historical = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    delete historical.page.posture

    render(<PosturePanel content={historical} />)

    expect(
      screen.getByRole('heading', { name: 'Still gathering, not yet deciding.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No pilot has been approved/i)).toBeInTheDocument()
  })

  it('routes only the four prose fields through the editor renderer', () => {
    const renderField = vi.fn((args: { path: string; value: string }) => (
      <span data-editor-path={args.path}>{args.value}</span>
    ))

    render(<PosturePanel content={DEFAULT_MY_WORLD_FAQ_CONTENT} renderField={renderField} />)

    expect(renderField.mock.calls.map(([args]) => args.path)).toEqual([
      'page.posture.eyebrow',
      'page.posture.heading',
      'page.posture.introduction',
      'page.posture.decisionNote',
    ])
    expect(screen.getAllByText('questions answered here')).toHaveLength(2)
    expect(screen.getByText(/Most recent review of any answer/i)).toBeInTheDocument()
  })
})
