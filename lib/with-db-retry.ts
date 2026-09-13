/**
 * One-shot retry for a Supabase/PostgREST read that fails with a transient,
 * gateway-timeout-shaped error. Confirmed live for #141 (2026-09-13, incident
 * logs): a pooled Postgres connection that's gone idle — e.g. a user idling
 * through the three Direction screens before the next request on that
 * connection — needs to re-establish before its next query, and that first
 * query can time out at the Supabase edge (a 504) while every other query on
 * the same connection, seconds before and after, returns in under a second.
 * Not a general resilience mechanism: retries exactly once, immediately, and
 * only for the specific failure shape confirmed below — not a loop, not
 * backoff, not applied to ordinary "not found"/validation errors.
 *
 * Transient-error detection is based on `status`, which
 * @supabase/postgrest-js's PostgrestBuilder always includes alongside
 * `data`/`error` (see node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts):
 * - A real non-2xx HTTP response (e.g. the confirmed 504) keeps `error` and
 *   `status` as whatever the server returned — no `error.code` is set in this
 *   path unless PostgREST's JSON error body happens to include one, so
 *   `status` is the only reliable signal, not a specific error code.
 * - A network-level failure (DNS, connection reset, abort) never reaches a
 *   real HTTP response at all; PostgrestBuilder's own fetch `.catch()`
 *   reports that case as `status: 0`.
 */

interface DbLikeResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
  status: number;
}

const TRANSIENT_STATUSES = new Set([0, 502, 503, 504]);

function isTransient(result: DbLikeResult): boolean {
  return result.error !== null && TRANSIENT_STATUSES.has(result.status);
}

/**
 * `label` identifies the call in logs (e.g. "hasEntitlement" or
 * "getCurrentArtifact(identity_report)") — pass something that pinpoints
 * which read this was without needing to correlate against other context.
 */
export async function withDbRetry<T extends DbLikeResult>(
  label: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  const first = await run();
  if (!isTransient(first)) return first;

  console.error(`[db-retry] ${label}: transient error (status ${first.status}), retrying once`, first.error);
  const second = await run();
  if (second.error) {
    console.error(`[db-retry] ${label}: retry did not recover`, { status: second.status, error: second.error });
  } else {
    console.error(`[db-retry] ${label}: retry recovered`);
  }
  return second;
}
