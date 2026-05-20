'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { battleGetMatch, type MatchRow } from '@/app/actions/battle';
import { BattleArena } from '@/components/battle/BattleArena';
import { ensureAnonSession } from '@/lib/battle/ensure-anon-session';

export function BattleMatchClient({
  paramsPromise,
}: {
  paramsPromise: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(paramsPromise);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await ensureAnonSession();
        if (cancelled) return;
        const m = await battleGetMatch(matchId);
        if (cancelled) return;
        if (!m || (user.id !== m.player1_id && user.id !== m.player2_id)) {
          setState('error');
          return;
        }
        setUserId(user.id);
        setMatch(m);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (state === 'loading') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-muted">Loading battle…</p>
      </main>
    );
  }

  if (state === 'error' || !match || !userId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-muted text-center max-w-sm">
          This match is unavailable, or guest sign-in failed. Enable <strong>Anonymous sign-ins</strong>{' '}
          in Supabase (Authentication → Providers) if you have not already.
        </p>
        <Link href="/battle" className="text-blue-600 underline text-sm">
          Back to matchmaking
        </Link>
      </main>
    );
  }

  const isOfferer = userId === match.player1_id;
  return <BattleArena matchId={matchId} userId={userId} initialMatch={match} isOfferer={isOfferer} />;
}
