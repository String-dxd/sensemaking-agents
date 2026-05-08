/**
 * The single tenancy boundary in v0.1.
 *
 * Every persistence call site that touches student data MUST go through
 * `withStudent`. The helper asserts a non-empty studentId and hands it to
 * the caller's fn. Without this, a stray query in db/queries.ts could
 * silently return cross-student rows; v1 promotes this contract to
 * Postgres + RLS, but the call shape stays the same.
 */
export function withStudent<T>(studentId: string, fn: (sid: string) => T): T {
  if (typeof studentId !== 'string' || studentId.trim().length === 0) {
    throw new Error(
      `withStudent: studentId must be a non-empty string. Received: ${typeof studentId === 'string' ? `"${studentId}"` : typeof studentId}`,
    )
  }
  return fn(studentId)
}
