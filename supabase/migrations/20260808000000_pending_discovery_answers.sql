-- #106: stage discovery answers server-side instead of passing them through
-- signUp()'s user_metadata, which is embedded directly in the session
-- JWT/auth cookie and was blowing past Vercel's request header size limit.
-- Service-role only, no RLS — there is no authenticated user to scope RLS
-- to at insert time (signUp() hasn't happened yet), by design.
CREATE TABLE IF NOT EXISTS public.pending_discovery_answers (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  answers     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pending_discovery_answers_pkey PRIMARY KEY (id)
);
