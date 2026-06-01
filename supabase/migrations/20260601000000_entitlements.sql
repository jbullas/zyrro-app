create table public.entitlements (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  product     text        not null,
  status      text        not null check (status in ('active', 'revoked')),
  source      text        not null check (source in ('stripe', 'manual')),
  created_at  timestamptz not null default now(),
  unique (user_id, product)
);

alter table public.entitlements enable row level security;

create policy "users can read own entitlements"
  on public.entitlements
  for select
  using (auth.uid() = user_id);
