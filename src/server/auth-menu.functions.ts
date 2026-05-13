import { createServerFn } from '@tanstack/react-start'

export const loadAuthMenu = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadAuthMenuHandler } = await import('./auth-menu.handler.server')
  return loadAuthMenuHandler()
})
