# Brief: #94 + #160, /identity hero accuracy

Two small changes to what the top of `/identity` shows: the domain each signature belongs to (#94) and the band label on each signature card (#160). Both need to land before the public share link (#7), which shares exactly this part of the report.

Two implementation commits (one per ticket), then this brief is deleted in its own commit once both are live-verified.

---

## Part 1: #94 Enforce the canonical signature domain

### Problem

Each of the 25 signatures has a fixed domain in `lib/signatures.ts` (`SIGNATURES`, e.g. Optimizer = Driving). Detection returns a `domain` for every signature in `signatures[]`, and nothing checks it against that table. A confirmed case: Optimizer came back as "Sensing".

A wrong domain has two effects:
- The card's domain label on `/identity` is wrong.
- `computeDomainProfile` groups scores by that domain, so the score is counted on the wrong domain bar.

### Fix

1. **Scale check first (read-only, no data changes).** Across all `identity_report` rows in the dev Supabase project, count signatures whose stored domain differs from `SIGNATURES` for that name. Check every place a domain is stored in the content: Detection's `signatures[]` in `raw_signature_analysis`, plus every report field that carries a per-signature domain (e.g. `primary_constellation`, `secondary_signature_analysis`, and any others you find). Report the counts, and list Jeff's current report (`301c7135-0a8e-449d-8322-5b956ff079db`) separately.
2. **Override at the source.** In `buildIdentityReportWithinDeadline` (`lib/generate-identity-report.ts`), right after Detection's JSON is parsed and **before** `computeDomainProfile` and `categorizePrimarySecondary` run, set each `signatures[]` entry's `domain` from `SIGNATURES` by name. Same "overwrite before Layer 2 runs" pattern already used there for `domain_profile` and categorisation. Log one line per correction (signature name, LLM domain, canonical domain).
3. **Backstop after Layer 2.** Layer 2 is told to copy the domain from its input, but don't rely on it: after Layer 2, apply the same lookup to every per-signature domain field in the report content that `/identity` or `/path` reads, and log any correction.
4. **Unknown names:** if a signature name isn't in `SIGNATURES`, leave it unchanged and log it. Don't guess a domain or rename it.

Put the lookup in one exported helper so verification scripts use the same code.

### Out of scope

- No changes to stored reports. Existing reports are pre-launch test data (decision 2026-10-04).
- No prompt changes.

---

## Part 2: #160 Rebalance the score bands

### Problem

A score is frequency × intensity, each 1 to 5. The current Strong band (14 to 19) can only be reached with 15 or 16, so almost every primary signature shows as Moderate. Jeff's five High-confidence signatures (16, 12, 12, 8, 8) show as 1 Strong and 4 Moderate.

### Fix

New bands (three bands only; Weak is retired):

| Band | Score |
|---|---|
| Dominant | 20 or more |
| Strong | 10 to 19 |
| Moderate | under 10 |

- `getScoreBand` in `app/identity/page.tsx` returns these three. `heroBand` then has nothing to floor; remove it and use `getScoreBand` directly. `bandClass` stays as it is.
- Before editing, search the whole codebase for any other place that computes or displays a band (code, prompts, copy in `lib/identity-report-copy.ts`), and change all of them together. Report what you found.
- Update the score bands list in `docs/standards/identity-signature-report.md` to match (and drop Weak there).

Display only. Nothing downstream reads the band.

---

## Verification

Each part is live-verified before its commit counts as done. Paste full, unabridged output for every check, not summaries.

**#94**
- Offline test of the helper: an analysis with a wrong domain is corrected and logged; an unknown signature name is left unchanged and logged.
- One full identity generation on a real user (e.g. e9ead1ad): every per-signature domain in the stored content matches `SIGNATURES`, and the log shows any corrections.
- `/identity` for that report at 1280: card domain labels and domain bars are consistent with the canonical domains.

**#160**
- A synthetic user with a report whose primary scores cover 9, 10, 16 and 20 (copy a real 1.4 report and adjust scores): cards show Moderate, Strong, Strong, Dominant. Screenshot at 1280 and 390. Tear the synthetic user down afterwards and confirm it's gone.

**Both**
- `npx tsc --noEmit` and `npx next build` pass.
- Verification scripts are temporary and deleted before committing.

---

## Stop conditions

Stop and report back before going further if:
- The scale check shows Jeff's report `301c7135` has any wrong domain. Don't touch it; report what's wrong.
- You find a per-signature domain field that `/identity` or `/path` reads and the override can't reach.
- Any other place computes or shows a band in a way that doesn't map cleanly onto the three new bands.
- Fixing either ticket would need a prompt change.

---

## Brief cleanup

Once both parts are committed and live-verified, delete this brief in its own commit (not an implementation commit), then confirm the deletion succeeded with `git log -1 --stat` and `ls docs/briefs/`.
