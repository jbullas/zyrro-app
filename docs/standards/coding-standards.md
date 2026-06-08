# Zyrro Coding Standards

## Before writing any code
Always read docs/standards/branding-guidelines.md 
before writing any code, creating any component, 
or modifying any styles.

For branch and commit protocol, see `AGENTS.md`.

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

For session start protocol, see `AGENTS.md`.