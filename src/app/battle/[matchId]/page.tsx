import { notFound, redirect } from 'next/navigation';
import { battleGetMatch } from '@/app/actions/battle';
import { BattleArena } from '@/components/battle/BattleArena';
import { createServerSupabase } from '@/utils/supabase/server';

export default async function BattleMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/battle/${matchId}`);
  }

  const match = await battleGetMatch(matchId);
  if (!match) {
    notFound();
  }

  const isParticipant = user.id === match.player1_id || user.id === match.player2_id;
  if (!isParticipant) {
    notFound();
  }

  const isOfferer = user.id === match.player1_id;

  return (
    <BattleArena matchId={matchId} userId={user.id} initialMatch={match} isOfferer={isOfferer} />
  );
}
