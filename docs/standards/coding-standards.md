# Zyrro Coding Standards

## Before writing any code
Always read docs/standards/branding-guidelines.md 
before writing any code, creating any component, 
or modifying any styles.

For branch and commit protocol, see `AGENTS.md`.

## Guiding principle
The primary objective is consistent code that's easy to maintain — not
just "no inline styles" as an isolated rule. Most UI patterns repeat
across pages; there's rarely a good reason to hand-code the same thing
per-page instead of using a shared component or globals.css class.

When a specific case is ambiguous (e.g. two page-specific patterns that
are similar but not identical), default to recommending consolidation
into one shared pattern rather than preserving the divergence — unless
there's a real, stated reason for the difference (e.g. genuinely
different UX requirements, not just accumulated drift).

## Local verification
- Before committing code changes, run them locally
  (npm run dev) and confirm the build passes and
  the affected pages work
- Commit only once it's working — never push
  untested code to dev, since dev deploys to staging
- Doc-only changes need a diff review, not a
  local run

## Styling
- globals.css is the single source of truth 
  for all styles
- Never use inline styles for any property 
  that appears more than once in the codebase
- Never declare a class on a standard HTML 
  element (p, h1, h2, h3, ul, li) unless it 
  needs to differ from the global default
- All new components must use existing global 
  classes before creating new ones
- If a new class is needed, add it to 
  globals.css, not inline

## Typography
Follow the type scale defined in 
docs/standards/branding-guidelines.md exactly.
Do not hardcode font sizes inline.

## Buttons
- Primary CTA: .btn-primary only
- Progress actions: .btn-secondary only
- Text actions: .btn-link only
- Never style buttons inline

## Colours
- Never hardcode colour values inline
- Always use the CSS classes or variables 
  defined in globals.css
- See branding-guidelines.md for brand colour
  intent and usage rules

## Components
- Reusable UI patterns must be React components
- Never duplicate markup across pages

## Page layout
- All pages use the same max-width container 
  as the homepage
- Content and bottom nav must be the same width
- Screen padding: 16-18px horizontal

Routes are defined by `app/`. See `product-decisions.md`
for the tier/purpose map.

## Gated pages
- Non-registered users see a gated state on all app pages
- Use the shared <GatedState> component in
  components/GatedState.tsx — never duplicate
  gated state markup across pages
- The page handles gating, not the nav

## Database / Supabase
- Every schema change (table, column, constraint,
  RLS policy, function) must be a timestamped
  migration file in supabase/migrations/,
  committed to the repo
- The committed migration is the source of truth
  — never change schema only in the Supabase
  dashboard or SQL editor without a matching
  committed migration
- Running a migration in Supabase is a separate
  manual step; note in the changelog when a
  migration has been applied
- Migrations are append-only: never edit or
  delete one that has already been applied —
  correct mistakes with a new migration

## Artifact regeneration (Tier C changes)
- When regenerating an LLM-generated artifact (identity_report,
  path_options, path_plan) due to a prompt/logic change, always INSERT a
  new row — never UPDATE an existing artifact's `content` in place.
- "Current" artifact for a given user/type is always the most recent by
  `created_at` (`order by created_at desc, limit 1`) — this is already the
  pattern `generatePathPlan` uses to resolve the identity report; keep
  applying it, don't special-case around it.
- Deterministic bugfixes to already-wrong stored data (e.g. #33, #1) are
  the exception — those UPDATE in place, since they're not a new version
  of a legitimate report. See docs/standards/product-decisions.md for the
  full tier policy.

## LLM calls
- All calls to the LLM provider go through `lib/llm.ts` — never
  instantiate the provider client or call its completion method
  directly in a route or lib file
- Model name is read from env (`OPENAI_MODEL`, default `gpt-4o`) —
  never hardcoded. Swapping models within the same provider is a
  one-line env change.
- Swapping providers entirely (e.g. OpenAI to Anthropic) is not a
  one-line change — `lib/llm.ts` currently wraps the OpenAI SDK
  directly, so a provider swap means rewriting the inside of that one
  file. The win from centralizing calls is that it's one file to
  change, not zero-effort provider independence.

For session start protocol, see `AGENTS.md`.