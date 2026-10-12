-- #7: public share links for the top of the Identity report (/s/[slug]).
--
-- A link points at a user, not a report: /s/[slug] always shows the user's
-- current ready identity_report at view time, so no artifact id is stored.
--
-- RLS is enabled with NO policies on purpose: only server code using the
-- service role (app/api/share-link, app/s/[slug]) reads or writes this table.
-- The anon/authenticated roles can't see or change any row.
--
-- One active link per user: the partial unique index makes a second active
-- row impossible, including two concurrent "create" requests. Revoking sets
-- revoked_at; sharing again inserts a new row with a new slug, and the old
-- slug stays dead.
CREATE TABLE public.identity_share_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slug       text        NOT NULL UNIQUE CHECK (char_length(slug) >= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX identity_share_links_one_active_per_user
  ON public.identity_share_links (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.identity_share_links ENABLE ROW LEVEL SECURITY;
