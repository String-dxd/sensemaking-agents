// Shared card+title wrapper every mode panel composes into the shell's
// managed right column (plan 012 step 1). Replaces each panel's own
// hand-rolled fixed-position card + `<strong>` header — the panels
// themselves keep 100% of their control logic; this is presentation only.
//
// Deliberately its own file rather than living in Shell.tsx: every panel
// (FacePanel, MaterialPanel, ...) imports this, and ModeTabs.tsx imports
// those panels, so if `PanelSection` lived in Shell.tsx the graph would be
// Shell -> ModeTabs -> <panel> -> Shell (circular ESM import). Living here
// (no imports back into shell/ModeTabs) keeps the graph acyclic.

import type { ReactNode } from 'react'

export function PanelSection({
  title,
  actions,
  children,
}: {
  title: string
  /** Optional header-right slot (e.g. SculptPanel's Sculpting/Off toggle,
   * WardrobePanel's "Undress all"). */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="cs-panel-section">
      <header className="cs-panel-section__header">
        <h3 className="cs-panel-section__title">{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  )
}
