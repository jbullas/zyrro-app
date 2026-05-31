# Report Generation Pipeline Brief

Read these files before writing any code:
- docs/standards/coding-standards.md
- docs/standards/product-decisions.md
- docs/standards/identity-signature-report.md
- lib/prompts/identity-analysis.ts
- lib/prompts/identity-report.ts
- lib/identity-questions.ts
- app/start/page.tsx
- app/auth/callback/route.ts
- utils/supabase/client.ts

## Overview
Wire the AI report generation pipeline to fire
immediately on contact form submission in /start.
Replace the current signInWithOtp flow with
signUp to create the user immediately, migrate
discovery answers to Supabase, then fire the
generation pipeline in the background.

## Step 1 — Update contact form submission
In app/start/page.tsx, replace the current
signInWithOtp call with this sequence:

1. Call supabase.auth.signUp with:
   - email: from form
   - password: crypto.randomUUID()
   - options.data.display_name: name from form
   This creates the user immediately and sends
   a confirmation email. Returns user_id.

2. Insert a row into profiles table:
   - user_id: from signUp response
   - name: from form

3. Read discovery answers from localStorage
   key zyrro_discovery_answers (array of
   { question_number, question_text, answer_text })
   Insert all answers into discovery_answers
   table with user_id. Do not hardcode the
   number of questions — insert whatever
   answers exist in localStorage.

4. Call /api/generate-report with POST,
   passing in body:
   - user_id
   - answers: the full discovery answers array

5. Advance to check-email screen as before.

6. Save name to localStorage as zyrro_user_name
   as before.

## Step 2 — Create /api/generate-report route
Create app/api/generate-report/route.ts

This route:
- Accepts POST with { user_id, answers }
- Creates an artifact row immediately:
  - user_id: from request
  - type: identity_report
  - access_level: free
  - status: generating
  - content: {} (empty, to be updated)
  Returns the artifact id.
- Returns 200 immediately (do not await 
  generation — fire and forget)
- Runs generation async in the background:

  Step A — Identity Analysis:
  - Import DETECTION_PROMPT from 
    lib/prompts/identity-analysis.ts
  - Call OpenAI API (use GPT-4o model)
  - System: DETECTION_PROMPT
  - User: JSON.stringify of the answers array
  - Parse response as JSON (structured 
    signature analysis)

  Step B — Report Generation:
  - Import LAYER_2_PROMPT from 
    lib/prompts/identity-report.ts
  - Call OpenAI API (use GPT-4o model)
  - System: LAYER_2_PROMPT
  - User: JSON.stringify of Step A output
  - Parse response as JSON (full report)

  Step C — Update artifact:
  - Update artifact row with:
    - status: ready
    - content: full report JSON from Step B
  
  On any error in Steps A, B, or C:
  - Update artifact status to: failed
  - Log the error

## Step 3 — Update /identity page
In app/identity/page.tsx, update the
discovery answers migration:
- Remove the migration logic entirely
  (answers are now migrated on form submission)
- Remove the zyrro_user_name localStorage
  read and updateUser call — display_name
  is now set via signUp options.data

## Step 4 — Update auth callback
In app/auth/callback/route.ts:
- No changes needed to redirect logic
- Confirm it still redirects to /identity

## Step 5 — Environment variables
The API route needs the OpenAI API key.
Use process.env.OPENAI_API_KEY.
Confirm this exists in .env.local and
in Vercel environment variables.
Do not hardcode any API keys.

## Step 6 — RLS policies for artifacts
Run this in Supabase SQL editor before testing:
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own artifacts"
ON artifacts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own artifacts"
ON artifacts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

Note: The generate-report API route runs
server-side using the service role key,
so it bypasses RLS for inserts. The
Supabase client in the API route must
use the service role key, not the anon key.
Create a server-side Supabase client using
SUPABASE_SERVICE_ROLE_KEY for this route.

## Error handling
- If signUp fails: show inline error on 
  contact form
- If discovery answers are empty: still 
  proceed with signUp and show check-email 
  screen, but skip the generate-report call
- If generate-report call fails: do not 
  block the user — they still see 
  check-email screen. The /identity page 
  will show the failed state with retry option

## Model
Use GPT-4o for both API calls.
Do not use GPT-4o-mini.
Set max_tokens: 4000 for identity analysis.
Set max_tokens: 8000 for report generation.

## Do not change
- The check-email screen UI
- The generating screen UI in /start
- Any other pages or components

Run TypeScript check when done and
confirm no errors.