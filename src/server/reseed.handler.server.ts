// TEMPORARY one-shot production reseed lane. The Vercel runtime holds
// DATABASE_URL (marked sensitive, so it can't be pulled locally); this
// handler lets us re-run the demo seed where the credential already lives.
// Remove the route + this file + the SEED_ADMIN_TOKEN env var after use.

import { createHash, timingSafeEqual } from 'node:crypto'
import type { MultiStudentSeedCorpus } from '~/db/seed'
import { seed } from '~/db/seed'
import corpusJson from '../../test/ablation/fixtures/seed-multistudent.json'

export async function reseedHandler(request: Request): Promise<Response> {
  if (!isAuthorizedReseedRequest(request)) {
    return Response.json({ ok: false, status: 'auth_error' }, { status: 401 })
  }
  try {
    const result = await seed({
      corpus: corpusJson as unknown as MultiStudentSeedCorpus,
      replaceExisting: true,
    })
    return Response.json({ ok: true, result })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        status: 'seed_error',
        message: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 },
    )
  }
}

function isAuthorizedReseedRequest(request: Request): boolean {
  const secret = process.env.SEED_ADMIN_TOKEN
  if (!secret) return false
  const presented = request.headers.get('Authorization')
  if (!presented) return false
  // Hash both sides to equal length so timingSafeEqual never throws on
  // length mismatch and length itself leaks nothing.
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(a, b)
}
