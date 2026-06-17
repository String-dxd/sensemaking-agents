import { type BirdConfig, isValidConfig } from '../bird/birdConfig'

// Encode the whole config into the URL hash so a bird is shareable by link with
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

export function encodeConfigToHash(config: BirdConfig): string {
  return `#${PARAM}=${toB64(JSON.stringify(config))}`
}

export function decodeConfigFromHash(hash: string): BirdConfig | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (raw.length > MAX_HASH_LEN) return null
    const part = raw.split('&').find((p) => p.startsWith(`${PARAM}=`))
    if (!part) return null
    const parsed: unknown = JSON.parse(fromB64(part.slice(PARAM.length + 1)))
    return isValidConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}
