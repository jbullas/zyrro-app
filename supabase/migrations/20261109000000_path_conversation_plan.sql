-- #169: the Plan for the path chosen in the Path conversation is stored as its
-- own artifact type, path_conversation_plan (brief 169-plan, decision of
-- 2026-11-09). The type list is 20261105000000_path_conversation.sql's, with
-- the new type added. Content is jsonb; its shape is set in step 2.

ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_type_check
    CHECK (type IN (
      'identity_report',
      'identity_reframe',
      'path_options',
      'path_plan',
      'path_checkpoint_session',
      'path_checkpoint_result',
      'path_direction_session',
      'path_options_session',
      'path_report',
      'path_conversation_options',
      'path_choice',
      'path_conversation_plan'
    ));
