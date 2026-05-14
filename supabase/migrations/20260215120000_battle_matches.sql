-- 1v1 battle: queue, matches, RPCs (SECURITY DEFINER for atomic matching).
-- Enable Supabase Realtime (project default) so WebRTC signaling broadcast channels work.
-- Apply in Supabase SQL Editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- Queue: one waiting row per user (enforced in join logic + unique partial index)
-- ---------------------------------------------------------------------------
create table if not exists public.match_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'waiting' check (status = 'waiting'),
  created_at timestamptz not null default now()
);

create unique index if not exists match_queue_one_waiting_per_user
  on public.match_queue (user_id);

-- ---------------------------------------------------------------------------
-- Matches: player1 = first waiter (WebRTC offerer), player2 = joiner
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid not null references public.users (id) on delete cascade,
  player2_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pairing' check (status in ('pairing', 'live', 'completed', 'cancelled')),
  player1_reps int not null default 0 check (player1_reps >= 0),
  player2_reps int not null default 0 check (player2_reps >= 0),
  player1_ready boolean not null default false,
  player2_ready boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  winner_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint matches_distinct_players check (player1_id <> player2_id)
);

create index if not exists matches_players_idx on public.matches (player1_id, player2_id);

-- ---------------------------------------------------------------------------
-- join_match_queue: advisory lock serializes pairing; FIFO partner = oldest waiter
-- ---------------------------------------------------------------------------
create or replace function public.join_match_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  partner record;
  new_id uuid;
  p1 uuid;
  p2 uuid;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  perform pg_advisory_xact_lock(42424242);

  delete from public.match_queue where user_id = uid;

  select mq.* into partner
  from public.match_queue mq
  where mq.user_id <> uid
  order by mq.created_at asc
  limit 1
  for update skip locked;

  if not found then
    insert into public.match_queue (user_id) values (uid);
    return jsonb_build_object('matched', false);
  end if;

  p1 := partner.user_id;
  p2 := uid;

  delete from public.match_queue where user_id in (p1, p2);

  insert into public.matches (player1_id, player2_id, status)
  values (p1, p2, 'pairing')
  returning id into new_id;

  return jsonb_build_object(
    'matched', true,
    'match_id', new_id,
    'player1_id', p1,
    'player2_id', p2,
    'is_offerer', uid = p1
  );
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.leave_match_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.match_queue where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.get_match(m_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.matches%rowtype;
begin
  if uid is null then
    return null;
  end if;

  select * into r from public.matches m where m.id = m_id;
  if not found then
    return null;
  end if;
  if uid <> r.player1_id and uid <> r.player2_id then
    return null;
  end if;

  return to_jsonb(r);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.mark_match_ready(m_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.matches%rowtype;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into r from public.matches m where m.id = m_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if uid <> r.player1_id and uid <> r.player2_id then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if uid = r.player1_id then
    update public.matches set player1_ready = true where id = m_id;
  else
    update public.matches set player2_ready = true where id = m_id;
  end if;

  select * into r from public.matches m where m.id = m_id;

  if r.player1_ready and r.player2_ready and r.status = 'pairing' then
    update public.matches
    set
      status = 'live',
      starts_at = now() + interval '3 seconds',
      ends_at = now() + interval '3 seconds' + interval '60 seconds'
    where id = m_id;
    select * into r from public.matches m where m.id = m_id;
  end if;

  return to_jsonb(r);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.update_battle_reps(m_id uuid, reps integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.matches%rowtype;
  v int := greatest(0, coalesce(reps, 0));
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into r from public.matches m where m.id = m_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if r.status <> 'live' or r.starts_at is null or r.ends_at is null then
    return jsonb_build_object('error', 'not_live');
  end if;
  if now() < r.starts_at or now() >= r.ends_at then
    return jsonb_build_object('error', 'outside_window');
  end if;

  if uid = r.player1_id then
    update public.matches set player1_reps = greatest(player1_reps, v) where id = m_id;
  elsif uid = r.player2_id then
    update public.matches set player2_reps = greatest(player2_reps, v) where id = m_id;
  else
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into r from public.matches m where m.id = m_id;
  return to_jsonb(r);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.finalize_match(m_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.matches%rowtype;
  w uuid;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into r from public.matches m where m.id = m_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if uid <> r.player1_id and uid <> r.player2_id then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if r.status <> 'live' then
    return to_jsonb(r);
  end if;

  if now() < r.ends_at then
    return jsonb_build_object('error', 'not_finished', 'match', to_jsonb(r));
  end if;

  if r.player1_reps > r.player2_reps then
    w := r.player1_id;
  elsif r.player2_reps > r.player1_reps then
    w := r.player2_id;
  else
    w := null;
  end if;

  update public.matches
  set status = 'completed', winner_id = w
  where id = m_id;

  select * into r from public.matches m where m.id = m_id;
  return to_jsonb(r);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: matches readable by participants; mutations via RPC only (definer)
-- ---------------------------------------------------------------------------
alter table public.match_queue enable row level security;
alter table public.matches enable row level security;

drop policy if exists "matches_select_participants" on public.matches;
create policy "matches_select_participants"
  on public.matches for select
  to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);

-- No insert/update/delete on matches for authenticated (RPC uses definer)

drop policy if exists "match_queue_select_own" on public.match_queue;
create policy "match_queue_select_own"
  on public.match_queue for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.match_queue from authenticated;
revoke insert, update, delete on public.matches from authenticated;

grant select on public.matches to authenticated;
grant select on public.match_queue to authenticated;

grant execute on function public.join_match_queue() to authenticated;
grant execute on function public.leave_match_queue() to authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.mark_match_ready(uuid) to authenticated;
grant execute on function public.update_battle_reps(uuid, integer) to authenticated;
grant execute on function public.finalize_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Poll for match after join_match_queue returned matched=false
-- ---------------------------------------------------------------------------
create or replace function public.get_my_active_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.matches%rowtype;
begin
  if uid is null then
    return null;
  end if;

  select * into r
  from public.matches m
  where (m.player1_id = uid or m.player2_id = uid)
    and m.status in ('pairing', 'live')
  order by m.created_at desc
  limit 1;

  if found then
    return to_jsonb(r);
  end if;

  return null;
end;
$$;

grant execute on function public.get_my_active_match() to authenticated;
