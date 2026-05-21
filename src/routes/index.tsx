import { createFileRoute } from '@tanstack/react-router'

// The engine is mounted at the root layout (`src/routes/__root.tsx`) and
// stays visible across every route. The home route renders nothing of its
// own — the world canvas IS the home page.
export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return null
}
