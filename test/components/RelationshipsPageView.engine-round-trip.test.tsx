/**
 * Cross-tab smoke for U6 of
 * docs/plans/2026-05-19-002-feat-profile-relationships-choices-tabs-plan.md.
 *
 * Exercises the round-trip:
 *   - boot the engine slices on the React side
 *   - add a person via the view's form
 *   - confirm the slice has it and a re-render of the view shows it
 *   - confirm the slice's serialized snapshot makes it through hydrate()
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type RelationshipsActions,
  RelationshipsPageView,
  type VipsSelfSideClaim,
} from '~/components/RelationshipsPageView'
import Persistence, { memoryAdapter } from '~/engine/student-space/Game/State/Persistence.js'
import Relationships from '~/engine/student-space/Game/State/Relationships.js'
import { resetProfileTabBoot } from '~/lib/student-space/profile-tab-state'

beforeEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Relationships as unknown as { instance: unknown }).instance = null
  resetProfileTabBoot()
  new Persistence({ storage: memoryAdapter() })
})

afterEach(() => {
  ;(Persistence as unknown as { instance: unknown }).instance = null
  ;(Relationships as unknown as { instance: unknown }).instance = null
})

function BridgedRelationshipsView({ selfSide }: { selfSide?: VipsSelfSideClaim[] }) {
  const rel = new Relationships()
  const [, setV] = useState(0)
  useEffect(() => rel.subscribe(() => setV((v: number) => v + 1)), [rel])

  const actions: RelationshipsActions = {
    addPerson: (p) => rel.addPerson(p),
    removePerson: (id) => rel.removePerson(id),
    addBelonging: (p) => rel.addBelonging(p),
    removeBelonging: (id) => rel.removeBelonging(id),
    addPerspective: (p) => rel.addPerspective(p),
    removePerspective: (id) => rel.removePerspective(id),
  }

  return (
    <RelationshipsPageView
      map={rel.listMap()}
      belonging={rel.listBelonging()}
      perspectives={rel.listPerspectives()}
      selfSide={selfSide}
      actions={actions}
    />
  )
}

describe('Relationships round-trip (view ↔ engine slice ↔ persistence)', () => {
  it('adding a person via the form persists to the slice and re-renders the row', async () => {
    const user = userEvent.setup()
    render(<BridgedRelationshipsView />)
    expect(screen.getByTestId('relationships-map-empty')).toBeInTheDocument()

    await user.click(screen.getByTestId('relationships-map-add'))
    await user.type(screen.getByTestId('relationships-map-form-name'), 'Aiden')
    await user.selectOptions(screen.getByTestId('relationships-map-form-category'), 'close-friend')
    await user.click(screen.getByTestId('relationships-map-form-submit'))

    // Form should close after save; row should appear
    expect(screen.queryByTestId('relationships-map-form')).not.toBeInTheDocument()
    // The auto-generated id starts with 'rel_'
    const rows = screen.getAllByTestId(/^relationships-map-entry-/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Aiden')
    expect(rows[0]).toHaveTextContent('Close friend')
  })

  it('serialized snapshot survives a hydrate() into a fresh slice', () => {
    const a = new Relationships()
    a.addPerson({ name: 'Mr. Tan', category: 'teacher', quality: 'rely-on' })
    const snapshot = a.serialize()

    ;(Relationships as unknown as { instance: unknown }).instance = null
    const b = new Relationships()
    b.hydrate(snapshot)
    const list = b.listMap()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Mr. Tan')
  })
})
