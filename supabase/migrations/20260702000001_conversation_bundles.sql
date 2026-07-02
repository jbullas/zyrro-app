-- Conversation bundles: cached summary of a completed conversation.
-- last_message_at is tracked separately from conversations.updated_at because
-- set_conversations_updated_at fires on any row update (including writing the
-- summary itself), which would make every new message look like a fresh
-- summary. summary_generated_at is the staleness marker instead.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_conversation_last_message_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  UPDATE public.conversations
  SET last_message_at = new.created_at
  WHERE id = new.conversation_id;
  RETURN new;
end;
$$;

CREATE OR REPLACE TRIGGER set_messages_conversation_last_message_at
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_conversation_last_message_at();
