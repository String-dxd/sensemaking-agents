// Config guard for the response-hardening headers declared in `vercel.json`.
//
// These headers are applied by the Vercel platform, NOT by the app: they do
// not exist under `pnpm dev` (Vite dev server) and no code path in
// `api/index.ts` injects them. `vercel.json` is therefore the single source of
// truth, and this test is the only automated protection against a well-meaning
// edit silently weakening it.
//
// Pure file read — no DB, no network — so it runs unconditionally.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type VercelHeader = { key: string; value: string }
type VercelHeaderRule = { source: string; headers: VercelHeader[] }

const VERCEL_JSON = join(__dirname, '../../vercel.json')

function readHeaderRules(): VercelHeaderRule[] {
  const parsed = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as {
    headers?: VercelHeaderRule[]
  }
  return parsed.headers ?? []
}

function headerValue(rule: VercelHeaderRule, key: string): string | undefined {
  return rule.headers.find((h) => h.key === key)?.value
}

describe('vercel.json response headers', () => {
  it('parses and declares at least two header rules', () => {
    const rules = readHeaderRules()
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThanOrEqual(2)
  })

  it('applies the five hardening headers globally', () => {
    const global = readHeaderRules().find((r) => r.source === '/(.*)')
    expect(global).toBeDefined()
    if (!global) return

    expect(headerValue(global, 'Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains',
    )
    expect(headerValue(global, 'X-Content-Type-Options')).toBe('nosniff')
    expect(headerValue(global, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerValue(global, 'X-Frame-Options')).toBe('DENY')

    const permissions = headerValue(global, 'Permissions-Policy')
    expect(permissions).toBe('microphone=(self), camera=(), geolocation=(), payment=(), usb=()')
    // the app needs the mic for voice capture; denying it breaks the primary
    // interaction.
    expect(permissions).toContain('microphone=(self)')
    expect(permissions).not.toContain('microphone=()')
  })

  it('keeps the enforcing CSP to frame-ancestors only', () => {
    const global = readHeaderRules().find((r) => r.source === '/(.*)')
    // a report-only CSP does not enforce frame-ancestors; this minimal
    // enforcing header does, and cannot block resource loading. Widening it is
    // the CSP-promotion decision, not an incidental edit.
    expect(headerValue(global as VercelHeaderRule, 'Content-Security-Policy')).toBe(
      "frame-ancestors 'none'",
    )
  })

  it('ships the full CSP as report-only with the external origins it needs', () => {
    const global = readHeaderRules().find((r) => r.source === '/(.*)')
    const reportOnly = headerValue(
      global as VercelHeaderRule,
      'Content-Security-Policy-Report-Only',
    )
    expect(reportOnly).toBeDefined()
    if (!reportOnly) return

    // incompetech is the ambient-music CDN (`Game/View/Sound.js`); dropping it
    // silences the world.
    expect(reportOnly).toMatch(/media-src[^;]*https:\/\/incompetech\.com/)
    expect(reportOnly).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/)
  })

  it('sends no referrer at all on the share path', () => {
    // The share token is in the URL path, so any outbound click would carry it
    // in the `Referer` unless the header is suppressed entirely.
    const share = readHeaderRules().find((r) => r.source === '/share/(.*)')
    expect(share).toBeDefined()
    expect(headerValue(share as VercelHeaderRule, 'Referrer-Policy')).toBe('no-referrer')
  })

  it('keeps the unlisted FAQ out of indexes and suppresses outbound referrers', () => {
    const faq = readHeaderRules().find((r) => r.source === '/my-world/faq')
    expect(faq).toBeDefined()
    if (!faq) return

    expect(headerValue(faq, 'X-Robots-Tag')).toBe('noindex, nofollow')
    expect(headerValue(faq, 'Referrer-Policy')).toBe('no-referrer')
  })

  it('keeps the FAQ editor pages and APIs private, unindexed, and cookie-varying', () => {
    const sources = [
      '/my-world/faq/edit',
      '/my-world/faq/edit/(.*)',
      '/api/my-world/faq/editor/(.*)',
    ]
    for (const source of sources) {
      const rule = readHeaderRules().find((candidate) => candidate.source === source)
      expect(rule, `missing header rule for ${source}`).toBeDefined()
      if (!rule) continue
      expect(headerValue(rule, 'X-Robots-Tag')).toBe('noindex, nofollow')
      expect(headerValue(rule, 'Referrer-Policy')).toBe('no-referrer')
      expect(headerValue(rule, 'Cache-Control')).toBe('private, no-store')
      expect(headerValue(rule, 'CDN-Cache-Control')).toBe('no-store')
      expect(headerValue(rule, 'Vercel-CDN-Cache-Control')).toBe('no-store')
      expect(headerValue(rule, 'Vary')).toBe('Cookie')
    }
  })
})
