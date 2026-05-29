# Registration flow brief

Read these files before writing any code:
- docs/standards/coding-standards.md
- docs/standards/branding-guidelines.md
- app/start/page.tsx
- app/signup/page.tsx
- app/login/page.tsx
- utils/supabase/client.ts
- app/auth/callback/route.ts

## Overview
Replace the current password-based registration 
with a magic link (passwordless) flow.
Add a contact collection screen to the end of 
the /start questionnaire flow.
Update /signup and /login to use magic link.

## 1. Contact collection screen in /start

Add as a new screen after the generating screen.
This is screen 15 in the flow (after Q13 + 
generating).

Hide progress bar (same as generating screen).

Layout:
- Eyebrow: YOUR IDENTITY REPORT IS READY
- Heading (h1): Create your free account to 
  see your report
- Subtext (p): Your Named Identity and full 
  Signature Report are waiting.
- Name input field (type text, placeholder 
  "Your first name", required)
- Email input field (type email, placeholder 
  "Your email address", required)
- Primary CTA button: "Get my Identity Report"
- Small helper text below button: 
  "Free. No credit card required."
- Error state: show inline error message if 
  Supabase returns an error

On submit:
1. Save name to Supabase profiles table 
   (user_id, name) after account creation
2. Call supabase.auth.signInWithOtp({ 
   email, options: { emailRedirectTo: 
   window.location.origin + '/auth/callback' }})
3. Save name to localStorage as 
   zyrro_user_name for use before session 
   is confirmed
4. Migrate localStorage discovery answers 
   (zyrro_discovery_answers) to Supabase 
   discovery_answers table with user_id
5. Advance to "check your email" screen

## 2. Check your email screen in /start

Add as a new screen after contact collection.

Layout:
- No progress bar
- Eyebrow: ONE MORE STEP
- Heading (h1): Check your inbox
- Body (p): We sent a confirmation link to 
  [email]. Click it to access your report.
- Secondary note (small): 
  Can't find it? Check your spam folder.
- Secondary button: "Resend the link" 
  (calls signInWithOtp again with same email)

## 3. Update /auth/callback/route.ts

After successful magic link confirmation:
- Exchange code for session as currently 
  implemented
- Redirect to /identity (not /dashboard)

## 4. Update /signup/page.tsx

Replace current email + password form with 
magic link flow:

Layout:
- Heading: Create your account
- Email input only (no password field)
- Primary CTA: "Send me a link"
- Helper text: "We'll send you a magic link 
  to sign in. No password needed."
- On submit: call signInWithOtp
- On success: show inline confirmation 
  "Check your inbox for your sign in link."
- Keep "Already have an account? Log in" link

## 5. Update /login/page.tsx

Replace current email + password form with 
magic link flow:

Layout:
- Heading: Log in to Zyrro
- Email input only (no password field)
- Primary CTA: "Send me a link"
- Helper text: "We'll send you a magic link 
  to sign in. No password needed."
- On submit: call signInWithOtp
- On success: show inline confirmation 
  "Check your inbox for your sign in link."
- Keep "Don't have an account? Sign up" link
- After magic link login, redirect to 
  /identity (not /dashboard, unless they 
  already have a report — check artifacts 
  table; if report exists go to /identity, 
  if not go to /start)

## 6. Supabase configuration

Make sure the following redirect URL is in 
Supabase Authentication > URL Configuration:
[site url]/auth/callback

Magic link uses signInWithOtp — no changes 
needed to Supabase project settings beyond 
ensuring email is enabled as auth provider.

## Design
Follow branding-guidelines.md and 
coding-standards.md exactly.
Use globals.css classes throughout.
No inline styles for repeated properties.
Contact collection screen and check your 
email screen should feel consistent with 
the rest of the /start flow — same 
off-white background, same card style, 
same typography.