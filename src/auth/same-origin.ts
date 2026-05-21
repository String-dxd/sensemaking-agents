// Same-origin gate shared by `/api/auth/sign-in` (demo POST) and
// `/api/auth/sign-out`. Refuses requests that cannot positively prove they
// originated on this site.
//
// The earlier implementation passed any request that lacked both the `Origin`
// header and a `Sec-Fetch-*` hint, on the assumption that a missing header
// meant a same-origin top-level navigation. That assumption is false for
// tools like curl, server-side fetchers, or browsers stripped of fetch
// metadata — they can drive state-changing endpoints by simply omitting the
// signals we used to require. Modern browsers always send at least one of
// `Origin` or `Sec-Fetch-Site` on a credentialed POST, so demanding positive
// proof here is safe for real users and closes the curl-style bypass.

export function isSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (origin) return origin === requestUrl.origin
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite) return fetchSite === 'same-origin'
  return false
}
