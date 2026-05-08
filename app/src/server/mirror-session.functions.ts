import { createServerFn } from '@tanstack/react-start'

/**
 * U1 placeholder. U4 replaces this with the real ephemeral-token mint
 * against `POST https://api.openai.com/v1/realtime/sessions`.
 */
export const mintMirrorSession = createServerFn({ method: 'POST' }).handler(async () => {
  return { ok: true as const, message: 'mirror-session placeholder — U4 wires the real mint' }
})
