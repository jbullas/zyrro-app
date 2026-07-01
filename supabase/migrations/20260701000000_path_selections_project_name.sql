-- Optional user-chosen Project name for a path selection
ALTER TABLE public.path_selections
  ADD COLUMN IF NOT EXISTS project_name text;
