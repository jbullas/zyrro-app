// Generation timing shared by the client pollers (lib/generation-status.ts,
// lib/checkpoint-status.ts, lib/use-identity-report.ts) and the server side
// of #162's identity report route. A plain module, so server code can import
// it: lib/generation-status.ts is 'use client' and re-exports these.

// Must match maxDuration on the five generation routes (app/auth/callback,
// app/api/retry-generation, app/api/generate-path-options, app/api/select-path,
// app/api/complete-discovery). The sixth, generate-identity-reframe, was
// removed in #126 (see docs/changelogs/2026-10-12.md).
// Invariant: SPINNER_LATE_COPY_MS < SPINNER_TIMEOUT_MS < GENERATION_BUDGET_MS
// (75 s < 120 s < 240 s). Adjust any one value while keeping this ordering.
export const GENERATION_BUDGET_MS = 240_000;
export const SPINNER_TIMEOUT_MS   = 120_000;
export const SPINNER_LATE_COPY_MS =  75_000;
export const FLIP_GUARD_MS        =  10_000;
