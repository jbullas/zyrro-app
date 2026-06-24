-- Shared trigger utility: stamps updated_at = now() on UPDATE.
-- Referenced by updated_at triggers across multiple tables (artifacts, plus others
-- as full-schema capture proceeds). Single source of truth for this function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
