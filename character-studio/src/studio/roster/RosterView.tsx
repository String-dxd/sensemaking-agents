// RosterView (plan 012 step 3) — entry screen: thumbnail grid of saved
// characters (open/duplicate/delete/rename), "New Character" archetype
// cards, import/export. Stubbed here so Shell.tsx's shape is final from
// step 1 onward; fleshed out against rosterStore.ts in step 3.

export function RosterView({ onClose }: { onClose(): void }) {
  return (
    <div className="cs-roster-overlay" role="dialog" aria-modal="true" aria-label="Roster">
      <div className="cs-roster">
        <header className="cs-roster__header">
          <h2>Roster</h2>
          <button type="button" className="cs-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="cs-roster__empty">Roster persistence lands in plan 012 step 2/3.</p>
      </div>
    </div>
  )
}
