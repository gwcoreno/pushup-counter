import { createServerSupabase } from '@/utils/supabase/server';

/** POST /api/battle/:matchId/forfeit — used by pagehide keepalive when the tab closes. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(null, { status: 401 });
  }

  const { error } = await supabase.rpc('forfeit_match', { m_id: matchId });
  if (error) {
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
