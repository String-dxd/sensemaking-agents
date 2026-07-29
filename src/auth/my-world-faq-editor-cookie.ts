export const MY_WORLD_FAQ_EDITOR_COOKIE_PRODUCTION = '__Host-my_world_faq_editor'
export const MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT = 'my_world_faq_editor_dev'

export function myWorldFaqEditorCookieName(secure: boolean): string {
  return secure ? MY_WORLD_FAQ_EDITOR_COOKIE_PRODUCTION : MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT
}

export function isPlainHttpLocalDevelopment(url: URL): boolean {
  const hostname = url.hostname.toLowerCase()
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  const isDeployment =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    typeof process.env.VERCEL_ENV === 'string'
  return url.protocol === 'http:' && isLoopback && !isDeployment
}

export function clearMyWorldFaqEditorCookieHeader(requestUrl: string): string {
  const secure = !isPlainHttpLocalDevelopment(new URL(requestUrl))
  return [
    `${myWorldFaqEditorCookieName(secure)}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ')
}
