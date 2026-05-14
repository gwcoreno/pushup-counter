-- App user row per auth user + workout sessions (one user -> many sessions).
-- Run via Supabase CLI (`supabase db push`) or paste into SQL Editor.

-- ---------------------------------------------------------------------------
-- public.users (application profile linked to auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Application user; one row per auth.users signup.';

-- ---------------------------------------------------------------------------
-- public.sessions (workout blocks: start, end, rep count)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reps integer not null default 0 check (reps >= 0),
  created_at timestamptz not null default now()
);

comment on table public.sessions is 'Push-up workout session; belongs to public.users.';

create index if not exists sessions_user_id_start_idx
  on public.sessions (user_id, start_time desc);

-- ---------------------------------------------------------------------------
-- New auth user -> row in public.users (runs as definer; bypasses RLS)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep email in sync if Supabase updates auth.users.email
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (Supabase often has these; safe to repeat)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update on table public.users to authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;
