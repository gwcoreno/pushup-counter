-- Guest / battle display name on public.users (also set from auth user_metadata on signup).

alter table public.users
  add column if not exists display_name text;

comment on column public.users.display_name is 'Player-visible name; set for guest (anonymous) sign-in.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_name text := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, meta_name)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.users.display_name),
        updated_at = now();
  return new;
end;
$$;
