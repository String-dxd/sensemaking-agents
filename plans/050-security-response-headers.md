# Plan 050: Add response-hardening headers, with CSP in report-only first

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 031d1974..HEAD -- vercel.json api/index.ts src/routes/__root.tsx src/routes/share.$token.tsx src/engine/student-space/Game/View/Sound.js test/routes/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a wrong CSP allow-list can break the WebGL world, the fonts,
  the background music, or the WebRTC voice session — which is why CSP ships
  report-only in this plan and enforcement is a separate human decision)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `031d1974`, 2026-07-25

## Why this matters

**Read this first: this is a missing defense-in-depth layer, not a patch for a
live bug.** The codebase is clean on injection sinks today — a repo-wide grep
finds no `dangerouslySetInnerHTML`, no `eval` / `new Function`, and no
`child_process` anywhere in `src/`. Nothing is currently exploitable through
these headers' absence.

What *is* true: the app ships **zero** response-hardening headers. A repo-wide
grep for `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` and
`Permissions-Policy` across `*.ts`, `*.tsx`, `*.js`, `*.mjs` and `*.json`
returns **no hits at all**. `vercel.json` has no `headers` block, and the
serverless adapter only passes through whatever the router emitted. So the
public share page — which renders a minor's identity profile to an
unauthenticated audience — can be framed by any site, leaks its
capability-token URL in the `Referer` on outbound clicks, and has no policy
backstop if a future change ever introduces a sink. For a product handling
Singapore school students' personal reflections, those are cheap headers to
be missing.

The concrete wins: framing protection on the share page, `Referer` no longer
carrying the share token off-origin, HSTS, MIME-sniffing off, a
`Permissions-Policy` that keeps the microphone (which the app genuinely needs)
and denies the rest, and a report-only CSP that tells us what an enforcing
policy would break *before* anyone turns it on.

## Current state

Files and their roles:

- `vercel.json` — the only place platform response headers can be declared.
  Today it has `framework`, `buildCommand`, `outputDirectory`, `functions`,
  `crons`, `rewrites` — and **no** `headers` key.
- `api/index.ts` — the Vercel Node adapter. At `:63-66` it copies the
  router's response headers onto the Node response and adds nothing:
  ```ts
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  ```
  So there is no code path that injects security headers today.
- `src/routes/share.$token.tsx` — the unauthenticated share page. `head()` at
  `:19-39` correctly sets `{ name: 'robots', content: 'noindex, nofollow' }`
  and a generic OG card ("Children's data — never leave a share URL
  searchable / unfurled with PII"), but there is no framing, referrer, or CSP
  protection. The token is in the **URL path** (`/share/$token`), so a
  `Referer` header on any outbound click carries it.
- `src/routes/__root.tsx:24-32` — the head links. This is where the external
  style/font origins come from:
  ```tsx
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:...' },
  ```

**The verified allow-list inputs** (each confirmed by reading the file — do
not re-derive, but do re-confirm if the drift check flags a change):

| What | Origin / scheme needed | Evidence |
|---|---|---|
| Google Fonts stylesheet | `https://fonts.googleapis.com` in `style-src` | `src/routes/__root.tsx:26-30` |
| Google Fonts files | `https://fonts.gstatic.com` in `font-src` | `src/routes/__root.tsx:27` |
| Ambient background music | `https://incompetech.com` in `media-src` | `src/engine/student-space/Game/View/Sound.js:45,59-80` — the track catalog streams four MP3s from incompetech (Kevin MacLeod). **If this origin is missing from `media-src`, the world goes silent.** |
| Voice session setup | `'self'` in `connect-src` | `src/lib/student-space/realtime-mirror-client.ts:82,143-147` POSTs the SDP offer to the **same-origin** `/api/openai/realtime-mirror`; the server (`src/server/openai-realtime-mirror-session.handler.server.ts:30`, `DEFAULT_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'`) proxies to OpenAI. The browser never talks to `api.openai.com` directly. |
| WebRTC media path | **no directive** — leave it alone | The audio itself flows over `RTCPeerConnection` to OpenAI's media servers. That path is governed by CSP3's `webrtc` directive, whose default when absent is *allow*. **Never add `webrtc 'block'`.** |
| GLB models / textures | `'self'` in `default-src` / `img-src` | `src/engine/student-space/Game/View/assetLoader.ts:3` — "One GLTFLoader for all editor GLBs (public/models/, self-hosted — gstatic is …". Assets are local; the DRACO-from-gstatic line in `Game/index.js:34` is a stale doc comment (grep for `draco` in `src/engine/` returns only that comment, no code). |
| Inline SVG data URIs | `data:` in `img-src` | e.g. `src/lib/student-space/mood-shapes.ts:43,76`, `src/engine/student-space/style.css:568` |
| Blob object URLs | `blob:` in `img-src`/`media-src` | `src/engine/student-space/Game/State/Persistence.js:159` (`URL.createObjectURL`) |
| Inline hydration script | `'unsafe-inline'` in `script-src` **for now** | TanStack Start's SSR emits an inline `<script>` for the dehydrated router state. The framework supports a per-request nonce (`router.options.ssr.nonce`), but `grep -rn "nonce" src/` returns **nothing** — it is unwired. Nonce adoption is explicitly a follow-up, not this plan. |
| Inline styles | `'unsafe-inline'` in `style-src` | React `style={{…}}` attributes plus the engine's per-frame `style.transform` mutation (`src/lib/student-space/use-world-position.ts`). |
| WorkOS auth | `form-action 'self'` is sufficient | Sign-in/out are **redirects**, not cross-origin form posts — `src/routes/api/auth/sign-in.tsx:41` calls `getSignInUrl()` and redirects; `sign-out.tsx:37` calls `signOut()`. No `<form action="https://…workos…">` exists. |

Repo conventions: package manager is **pnpm only**; `pnpm check` = Biome +
`tsc --noEmit`; tests are Vitest in `test/` mirroring `src/`; conventional
commits. Baseline at plan time: `pnpm check` exits 0 with 18 pre-existing lint
warnings; `pnpm test` = 911 passed / 128 skipped / 0 failed.

**Critical operating fact — inline this in the PR description too**: headers
declared in `vercel.json` are applied by the Vercel platform. They do **NOT**
apply under `pnpm dev` (Vite dev server). Report-only CSP violations therefore
cannot be observed locally; they must be checked on a **preview deployment**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Check | `pnpm check` | exit 0 (18 pre-existing warnings OK) |
| All tests | `pnpm test` | ≥911 passed, 0 failed |
| One file | `pnpm vitest run test/routes/response-headers.test.ts` | new tests pass |
| JSON valid | `node -e "JSON.parse(require('node:fs').readFileSync('vercel.json','utf8'));console.log('ok')"` | prints `ok` |
| Header check | `curl -sI https://<preview-url>/` | shows the headers from Step 1 |

## Scope

**In scope** (the only files you should modify/create):

- `vercel.json` — add a `headers` array
- `test/routes/response-headers.test.ts` (create) — the config guard test

**Out of scope** (do NOT touch, even though they look related):

- `api/index.ts` — do not inject headers in the adapter. Platform config is
  the single place; two sources would fight and diverge.
- `src/routes/__root.tsx` — do not self-host the Inter font or drop the
  Google Fonts link to simplify the CSP. That is a perceived-performance and
  visual-parity change, out of bounds here.
- `src/engine/student-space/Game/View/Sound.js` — do not self-host or remove
  the incompetech tracks. Add the origin to `media-src` instead.
- **Promoting CSP from report-only to enforcing.** That is an explicit human
  decision gate after violation reports are reviewed on a preview deploy. It
  is a follow-up plan, NOT this plan's done criteria.
- Wiring a CSP nonce through `router.options.ssr.nonce`, and any CSP
  violation-report *collection endpoint* (a new API route). Both deferred.
- Vercel project-level firewall / WAF rules — different control surface.
- Any change to `robots`/OG meta on the share page (already correct).

## Git workflow

- Branch: `advisor/050-security-response-headers`
- Conventional commits, e.g.
  `feat(security): add response-hardening headers and a report-only CSP`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the enforcing non-CSP headers

Add a top-level `"headers"` array to `vercel.json`, after `"crons"` and before
`"rewrites"`. First entry — the global block:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "Permissions-Policy", "value": "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" }
  ]
}
```

Three things are load-bearing:

1. **`microphone=(self)`, never `microphone=()`.** The app's whole voice
   capture path calls `navigator.mediaDevices.getUserMedia`
   (`src/lib/student-space/realtime-mirror-client.ts:127`). Denying the
   microphone breaks the primary product interaction.
2. **HSTS without `preload`.** `preload` is effectively irreversible via
   browser preload lists; do not add it here.
3. **`includeSubDomains`** is the one value that could bite if any sibling
   subdomain of the production domain is served over plain HTTP. If you cannot
   confirm that, drop `includeSubDomains` and note it in the PR — do not
   guess.

**Verify**: `node -e "const h=JSON.parse(require('node:fs').readFileSync('vercel.json','utf8')).headers; console.log(h.length, h[0].headers.map(x=>x.key).join(','))"`
→ prints `1 Strict-Transport-Security,X-Content-Type-Options,Referrer-Policy,X-Frame-Options,Permissions-Policy`

### Step 2: Tighten the referrer policy on the share path

The share token lives in the URL **path** (`/share/$token`). Under
`strict-origin-when-cross-origin` a cross-origin navigation still sends the
origin — not the token — but `no-referrer` on this path removes the header
entirely and is strictly better for a link that grants access to a minor's
profile. Add a second entry to the `headers` array (Vercel applies later
matching entries; keep it *after* the global block):

```json
{
  "source": "/share/(.*)",
  "headers": [{ "key": "Referrer-Policy", "value": "no-referrer" }]
}
```

**Verify**: `node -e "const h=JSON.parse(require('node:fs').readFileSync('vercel.json','utf8')).headers; console.log(h[1].source, h[1].headers[0].value)"`
→ prints `/share/(.*) no-referrer`

### Step 3: Add a minimal ENFORCING CSP that carries only `frame-ancestors`

This step exists because of a subtlety that is easy to get wrong: a
**report-only** CSP does **not** enforce `frame-ancestors`. To actually stop
framing via CSP (alongside the `X-Frame-Options` from Step 1) the directive
must be in an enforcing header. `frame-ancestors` constrains nothing except
who may embed the page, so an enforcing CSP containing *only* that directive
cannot break any resource loading.

Add to the **global** block from Step 1:

```json
{ "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" }
```

Do **not** add any other directive to this enforcing header in this plan.

**Verify**: `node -e "const g=JSON.parse(require('node:fs').readFileSync('vercel.json','utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy'); console.log(JSON.stringify(g.value))"`
→ prints exactly `"frame-ancestors 'none'"`

### Step 4: Add the full CSP as report-only

Add to the **global** block a `Content-Security-Policy-Report-Only` header
with the allow-list derived in "Current state". Put it on one line in the JSON
(Vercel header values are plain strings):

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob: https://incompetech.com; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'
```

Notes the executor must not "clean up":

- `script-src 'unsafe-inline'` is deliberate and temporary (TanStack Start's
  inline hydration script; nonce unwired — see "Current state"). Removing it
  is the promotion decision's job, not yours.
- **No `webrtc` directive.** Absent means allow, which is what the voice
  session needs.
- `connect-src 'self'` only. The browser's outbound fetch targets are all
  same-origin. If the preview deploy reports a `connect-src` violation, record
  the blocked URI verbatim in the PR — do not widen the directive to a
  wildcard.

**Verify**: `pnpm check` → exit 0, and
`node -e "const v=JSON.parse(require('node:fs').readFileSync('vercel.json','utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy-Report-Only').value; for (const d of ['default-src','frame-ancestors','media-src','font-src','style-src','img-src','connect-src']) if(!v.includes(d)) throw new Error('missing '+d); console.log('ok')"`
→ prints `ok`

### Step 5: Add the config guard test

Create `test/routes/response-headers.test.ts` (plain Vitest, no environment
pragma needed — it only reads a file with `node:fs`). Assert:

1. `vercel.json` parses and has a `headers` array with ≥2 entries.
2. The global `/(.*)` entry contains all five Step-1 headers with the exact
   values above — including `Permissions-Policy` containing `microphone=(self)`
   and **not** containing `microphone=()`. Comment that line: *"the app needs
   the mic for voice capture; denying it breaks the primary interaction."*
3. The enforcing `Content-Security-Policy` value is exactly
   `frame-ancestors 'none'` — i.e. it contains no other directive. Comment:
   *"a report-only CSP does not enforce frame-ancestors; this minimal
   enforcing header does, and cannot block resource loading. Widening it is
   the CSP-promotion decision, not an incidental edit."*
4. `Content-Security-Policy-Report-Only` exists and includes
   `https://incompetech.com` in `media-src` and `https://fonts.gstatic.com`
   in `font-src`. Comment: *"incompetech is the ambient-music CDN
   (`Game/View/Sound.js`); dropping it silences the world."*
5. There is a `/share/(.*)` entry whose `Referrer-Policy` is `no-referrer`.

**Verify**: `pnpm vitest run test/routes/response-headers.test.ts` → all new
tests pass.

### Step 6: Full gate

**Verify**: `pnpm check && pnpm test` → check exits 0; tests ≥911 passed plus
the new ones, 0 failed (the 128 pre-existing skips are expected).

### Step 7: Mandatory manual verification on a preview deployment

**This step is not optional and cannot be done locally.** `vercel.json`
headers do not apply under `pnpm dev`. Deploy a preview (the repo has a
`vercel:deploy` skill available; otherwise ask the operator to deploy the
branch) and walk this checklist, recording each result in the PR description:

- [ ] `curl -sI https://<preview>/` → all five Step-1 headers present, plus
      `Content-Security-Policy: frame-ancestors 'none'` and a
      `Content-Security-Policy-Report-Only` header.
- [ ] `curl -sI https://<preview>/share/<any-token>` → `Referrer-Policy: no-referrer`.
- [ ] Open `/` — the island world renders (terrain, trees, water). WebGL is
      unaffected by CSP, but confirm visually.
- [ ] Ambient background music plays (this is the `media-src` /
      incompetech check).
- [ ] Body text renders in Inter, not a fallback serif/sans (the
      `style-src` / `font-src` check).
- [ ] Run **one full voice capture end-to-end**: mic tap → speak a sentence →
      stop → the reflection comes back. This exercises `getUserMedia`
      (Permissions-Policy), the same-origin SDP POST (`connect-src`), and the
      WebRTC media path (no `webrtc` directive).
- [ ] Open a share page in a logged-out browser profile; the profile renders.
- [ ] Sign out and back in through WorkOS; the redirect round-trip completes
      (`form-action`).
- [ ] DevTools console, filtered on `Content Security Policy`: record **every**
      report-only violation verbatim (directive + blocked URI) in the PR. Zero
      is the goal; any violation is data for the promotion decision, not a
      licence to widen the policy in this plan.

**Verify**: the PR description contains the checklist with every box either
ticked or accompanied by the recorded violation text.

## Test plan

- New `test/routes/response-headers.test.ts` — five assertions listed in
  Step 5. All are pure file reads; no DB, no network, so they run
  unconditionally (unlike the `DATABASE_URL`-gated suites in `test/server/`).
- No existing test asserts response headers, so nothing should need adapting.
  If `pnpm test` regresses, that is a STOP condition, not a fixture to re-pin.
- Pattern exemplar for a config-reading Vitest file:
  `test/engine/SideRail.hrefs.test.ts` (reads source, asserts invariants).
- Verification: `pnpm test` → 0 failures, new tests included.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `vercel.json` parses as JSON and has a `headers` array
- [ ] `grep -c 'Strict-Transport-Security' vercel.json` → 1
- [ ] `grep -c 'microphone=(self)' vercel.json` → 1; `grep -c 'microphone=()' vercel.json` → 0
- [ ] The enforcing `Content-Security-Policy` value is exactly `frame-ancestors 'none'` (asserted by the Step-5 test)
- [ ] `grep -c 'Content-Security-Policy-Report-Only' vercel.json` → 1 (CSP is **not** enforced by this plan)
- [ ] `grep -c 'incompetech.com' vercel.json` → 1
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 with ≥911 passed and the new header tests passing
- [ ] The Step-7 preview checklist is recorded in the PR description
- [ ] `git status` shows only `vercel.json` and `test/routes/response-headers.test.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **No preview deployment is available.** Do not mark this plan done from
  local dev — the headers provably do not apply under `pnpm dev`, so the
  central risk (a CSP that breaks the world or the voice session) would go
  unmeasured.
- The voice capture in Step 7 fails, or the world renders without ambient
  music / with fallback fonts. Report the exact console violation; do not
  paper over it by adding `'unsafe-eval'`, a wildcard host (`*`,
  `https:`), or by deleting the offending directive.
- The report-only CSP reports a violation that would require `'unsafe-eval'`
  or `wasm-unsafe-eval` — that means something in the engine or a dependency
  does dynamic code generation that this plan's recon did not find. Report it;
  it changes the promotion calculus.
- `curl -sI` on the preview shows an `X-Frame-Options` or
  `Content-Security-Policy` value you did not write — the Vercel project may
  have a dashboard-level header or firewall rule that conflicts. Report rather
  than fighting it from config.
- The Vercel build rejects the `headers` block (schema error). Report the
  exact build error; do not start deleting entries to make it pass.
- You find yourself editing `api/index.ts`, `__root.tsx`, or `Sound.js` —
  all three are explicitly out of scope.

## Maintenance notes

For the human/agent who owns this after the change lands:

- **What a reviewer should scrutinise**: (1) that `Permissions-Policy` still
  grants `microphone=(self)` — a well-meaning tightening to `()` silently
  kills voice capture; (2) that the *enforcing* CSP still contains only
  `frame-ancestors` — any other directive slipping in there is an
  un-reviewed enforcement change; (3) that `media-src` still lists
  `https://incompetech.com`.
- **The promotion decision (deliberately deferred)**: turning the report-only
  CSP into an enforcing one is a separate plan. Its prerequisites are (a) a
  clean violation report across the world route, a voice capture, and a share
  page on a preview deploy, and (b) a decision on `script-src`: either keep
  `'unsafe-inline'` or wire a per-request nonce through TanStack Start's
  `router.options.ssr.nonce` (currently unwired — `grep -rn "nonce" src/`
  returns nothing).
- **Adding an external origin later** (a new CDN, an analytics script, a
  third-party font) now requires a matching CSP edit. Put the origin in the
  report-only header and re-run the Step-7 checklist before assuming it works.
- **Self-hosting Inter and the ambient tracks** would let a future enforcing
  CSP drop two external origins entirely. Attractive, but it is a
  perceived-performance and asset-pipeline change — deliberately out of scope
  here.
- A CSP violation-**reporting endpoint** (`report-to` + a route that ingests
  reports) was deferred: with report-only checked manually on previews, the
  browser console is sufficient, and a report ingest route is a new
  unauthenticated POST surface that would itself need bounding (see plan 051).
