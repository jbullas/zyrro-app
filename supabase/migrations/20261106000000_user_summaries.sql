-- #168 step 3b: the living user summary (docs/framework/path-plan-redesign.md,
-- "Living user summary"; docs/briefs/168-path-conversation.md, step 3b).
--
-- 1. user_summaries: one row per user, owned by the user rather than by any
--    conversation, so Plan and Mentor can read it later. Server-only: RLS on,
--    no policies, every read and write goes through the service role.
--    `summary` is rewritten on each update, never appended to; `version`
--    increments on every rewrite and is used as an optimistic-concurrency
--    check (a write names the version it read). Shape, caps and ref format
--    live in lib/user-summary.ts.
--
-- 2. path_profiles.reflections: the Path conversation's reflection moments
--    (offered / confirmed / corrected / rejected), each with the message id
--    it was offered in.

CREATE TABLE IF NOT EXISTS public.user_summaries (
  user_id          uuid        NOT NULL,
  summary          jsonb       NOT NULL,
  version          integer     NOT NULL DEFAULT 1,
  updated_by       text        NOT NULL,
  conversation_id  uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_summaries_pkey
    PRIMARY KEY (user_id),

  CONSTRAINT user_summaries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,

  CONSTRAINT user_summaries_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL
);

-- updated_by: who last rewrote it ('path_seed', 'path_turn'; later 'plan', 'mentor').
-- conversation_id: the conversation that last wrote it, if any.

CREATE OR REPLACE TRIGGER set_user_summaries_updated_at
  BEFORE UPDATE ON public.user_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS on with no policies: the browser can neither read nor write this table.
ALTER TABLE public.user_summaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.path_profiles
  ADD COLUMN IF NOT EXISTS reflections jsonb NOT NULL DEFAULT '[]'::jsonb;
