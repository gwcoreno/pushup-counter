'use server';

import { createServerSupabase } from '@/utils/supabase/server';

export type MatchRow = {
  id: string;
  player1_id: string;
  player2_id: string;
  status: string;
  player1_reps: number;
  player2_reps: number;
  player1_ready: boolean;
  player2_ready: boolean;
  starts_at: string | null;
  ends_at: string | null;
  winner_id: string | null;
  created_at: string;
};

function asMatch(row: unknown): MatchRow | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  return row as MatchRow;
}

export type JoinQueueResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; matchId: string; isOfferer: boolean }
  | { ok: false; error: string };

export async function battleJoinQueue(): Promise<JoinQueueResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('join_match_queue');
  if (error) return { ok: false, error: error.message };
  const row = data as Record<string, unknown> | null;
  if (row?.error) return { ok: false, error: String(row.error) };
  if (!row?.matched) return { ok: true, matched: false };
  return {
    ok: true,
    matched: true,
    matchId: String(row.match_id),
    isOfferer: Boolean(row.is_offerer),
  };
}

export async function battleLeaveQueue(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.rpc('leave_match_queue');
}

export async function battleGetMyActiveMatch(): Promise<MatchRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_my_active_match');
  if (error || !data) return null;
  return asMatch(data);
}

export async function battleGetMatch(matchId: string): Promise<MatchRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_match', { m_id: matchId });
  if (error || !data) return null;
  return asMatch(data);
}

export async function battleMarkReady(matchId: string): Promise<MatchRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('mark_match_ready', { m_id: matchId });
  if (error || !data) return null;
  const o = data as Record<string, unknown>;
  if (o.error) return null;
  return asMatch(data);
}

export async function battleUpdateReps(matchId: string, reps: number): Promise<MatchRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('update_battle_reps', {
    m_id: matchId,
    reps: Math.max(0, Math.floor(reps)),
  });
  if (error || !data) return null;
  const o = data as Record<string, unknown>;
  if (o.error) return null;
  return asMatch(data);
}

export async function battleFinalize(matchId: string): Promise<MatchRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('finalize_match', { m_id: matchId });
  if (error || !data) return null;
  const o = data as Record<string, unknown>;
  if (o.error === 'not_finished') return asMatch(o.match) ?? null;
  if (o.error) return null;
  return asMatch(data);
}
