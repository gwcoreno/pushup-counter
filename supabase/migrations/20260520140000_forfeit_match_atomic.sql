-- Only the first forfeit wins; concurrent calls cannot flip the winner.

create or replace function public.forfeit_match(m_id uuid)
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

  if r.status not in ('pairing', 'live') then
    return to_jsonb(r);
  end if;

  if uid = r.player1_id then
    w := r.player2_id;
  else
    w := r.player1_id;
  end if;

  update public.matches
  set status = 'completed', winner_id = w
  where id = m_id and status in ('pairing', 'live');

  select * into r from public.matches m where m.id = m_id;
  return to_jsonb(r);
end;
$$;
