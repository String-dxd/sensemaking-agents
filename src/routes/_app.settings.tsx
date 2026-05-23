import { createFileRoute } from '@tanstack/react-router'
import { SettingsSheet } from '~/components/student-space/sheets/SettingsSheet'

// `/settings` — new route added in U4 of the React migration. The engine
// SettingsSheet had no live View.js consumer pre-migration; the React route
// is the first real entry point for the surface.
export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return <SettingsSheet />
}
