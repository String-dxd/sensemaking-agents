import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * Layout route for `/reflect/*`. Renders only an Outlet so the child routes
 * (`reflect.index.tsx` for the live Mirror session, `reflect.review.tsx` for
 * the post-Mirror review surface) own their own content. Without this split,
 * TanStack Router would render this layout's component AND the child — which
 * resulted in `/reflect/review` rendering the MirrorSession instead of the
 * post-Mirror review surface during smoke testing.
 */
export const Route = createFileRoute('/reflect')({
  component: ReflectLayout,
})

function ReflectLayout() {
  return <Outlet />
}
