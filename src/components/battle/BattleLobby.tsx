'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  battleGetMyActiveMatch,
  battleJoinQueue,
  battleLeaveQueue,
} from '@/app/actions/battle';

export function BattleLobby() {
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearPoll();
      void battleLeaveQueue();
    };
  }, []);

  const goToMatch = useCallback(
    (matchId: string) => {
      clearPoll();
      setSearching(false);
      router.push(`/battle/${matchId}`);
    },
    [router],
  );

  const startSearch = async () => {
    setError(null);
    setSearching(true);
    try {
      const first = await battleJoinQueue();
      if (!first.ok) {
        setError(first.error);
        setSearching(false);
        return;
      }
      if (first.matched) {
        goToMatch(first.matchId);
        return;
      }
      clearPoll();
      pollRef.current = setInterval(async () => {
        const active = await battleGetMyActiveMatch();
        if (active?.id) {
          goToMatch(active.id);
        }
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join queue');
      setSearching(false);
    }
  };

  const cancelSearch = async () => {
    clearPoll();
    await battleLeaveQueue();
    setSearching(false);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold text-foreground">1v1 battle</h1>
      <p className="text-sm text-muted">
        You will be paired with another signed-in player. When both are ready, you get a{' '}
        <strong>60 second</strong> window — most push-up reps wins. Peer video uses WebRTC over
        Supabase Realtime (STUN only; some networks need TURN for production).
      </p>
      {!searching ? (
        <button
          type="button"
          onClick={() => void startSearch()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-8 rounded-lg"
        >
          Find opponent
        </button>
      ) : (
        <div className="space-y-4 w-full">
          <p className="text-muted animate-pulse">Searching for an opponent…</p>
          <button
            type="button"
            onClick={() => void cancelSearch()}
            className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface w-full"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </main>
  );
}
