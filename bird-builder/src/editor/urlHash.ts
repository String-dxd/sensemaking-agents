import { type BirdGenome, isValidGenome } from '../bird/genome'
import { migrate } from '../bird/migrate'

// Encode the whole genome into the URL hash so a bird is shareable by link with
// zero backend (the CK3-DNA / "the URL is the save file" pattern). UTF-8-safe
// Base64 via TextEncoder/TextDecoder (no deprecated escape/unescape), works in
// both the browser and the node test env.

const PARAM = 'b'
const MAX_HASH_LEN = 8192 // guard against pathological/oversized hashes

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Encode to a `#b=…` hash, or return `''` if it would exceed the cap. The
 * encode-side guard (the cap was previously checked on DECODE only) means we
 * never silently emit an over-cap hash that fails to round-trip and breaks the
 * share link — callers skip updating the URL when this returns ''.
 */
export function encodeConfigToHash(config: BirdGenome): string {
  const hash = `#${PARAM}=${toB64(JSON.stringify(config))}`
  if (hash.length > MAX_HASH_LEN) {
    if (typeof console !== 'undefined') console.warn(`bird hash ${hash.length} > ${MAX_HASH_LEN} cap — URL not updated`)
    return ''
  }
  return hash
}

export function decodeConfigFromHash(hash: string): BirdGenome | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (raw.length > MAX_HASH_LEN) return null
    const part = raw.split('&').find((p) => p.startsWith(`${PARAM}=`))
    if (!part) return null
    const migrated = migrate(JSON.parse(fromB64(part.slice(PARAM.length + 1))))
    return isValidGenome(migrated) ? migrated : null
  } catch {
    return null
  }
}
