/**
 * Legacy sync tenancy helper from v0.1 — preserved as `withStudentLegacy` to
 * avoid name-colliding with the async `withStudent` exported from
 * `~/db/client`. The async helper opens a Postgres transaction and binds the
 * RLS GUC; this helper merely asserts the studentId is non-empty and hands it
 * to the caller's fn.
 *
 * New code MUST use `~/db/client.withStudent`. The remaining consumers of
 * `withStudentLegacy` are the legacy OpenAI Agents handoff chain + the
 * Mirror/search-past-mirrors handlers, all slated for cleanup in later
 * Steps of the managed-agents migration.
 */
export function withStudentLegacy<T>(studentId: string, fn: (sid: string) => T): T {
  if (typeof studentId !== 'string' || studentId.trim().length === 0) {
    throw new Error(
      `withStudentLegacy: studentId must be a non-empty string. Received: ${typeof studentId === 'string' ? `"${studentId}"` : typeof studentId}`,
    )
  }
  return fn(studentId)
}
