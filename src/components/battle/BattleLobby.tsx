'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  battleGetMyActiveMatch,
  battleJoinQueue,
  battleLeaveQueue,
} from '@/app/actions/battle';
import {
  createGuestSession,
  getExistingBattleUser,
  type BattleUser,
} from '@/lib/battle/guest-session';

type LobbyPhase = 'loading' | 'name' | 'lobby';

export function BattleLobby() {
  const router = useRouter();
  const [phase, setPhase] = useState<LobbyPhase>('loading');
  const [battleUser, setBattleUser] = useState<BattleUser | null>(null);
  const [guestName, setGuestName] = useState('');
  const [namePending, setNamePending] = useState(false);
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
    let cancelled = false;
    void (async () => {
      try {
        const existing = await getExistingBattleUser();
        if (cancelled) return;
        if (!existing) {
          setPhase('name');
          return;
        }
        if (existing.isAnonymous && !existing.displayName) {
          setPhase('name');
          return;
        }
        setBattleUser(existing);
        setPhase('lobby');
      } catch {
        if (!cancelled) {
          setError('Could not load session.');
          setPhase('name');
        }
      }
    })();
    return () => {
      cancelled = true;
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

  const submitGuestName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNamePending(true);
    try {
      const user = await createGuestSession(guestName);
      setBattleUser(user);
      setPhase('lobby');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue as guest');
    } finally {
      setNamePending(false);
    }
  };

  const startSearch = async () => {
    setError(null);
    setSearching(true);
    try {
      const existing = await getExistingBattleUser();
      if (!existing) {
        setError('Enter your name to play.');
        setSearching(false);
        setPhase('name');
        return;
      }
      setBattleUser(existing);
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

  if (phase === 'loading') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-muted">Loading…</p>
      </main>
    );
  }

  if (phase === 'name') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold text-foreground">1v1 battle</h1>
        <p className="text-sm text-muted">
          No account required. Enter a name to join matchmaking — your guest session is created only
          after you continue.
        </p>
        <form onSubmit={(e) => void submitGuestName(e)} className="w-full space-y-4 text-left">
          <div>
            <label htmlFor="guest-name" className="block text-sm font-medium mb-1">
              Your name
            </label>
            <input
              id="guest-name"
              name="guestName"
              type="text"
              autoComplete="nickname"
              required
              maxLength={32}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={namePending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
          >
            {namePending ? 'Continuing…' : 'Continue'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold text-foreground">1v1 battle</h1>
      {battleUser?.displayName && (
        <p className="text-sm text-muted">
          Playing as <strong className="text-foreground">{battleUser.displayName}</strong>
        </p>
      )}
      <p className="text-sm text-muted">
        You will be paired with another player. When both tap <strong>Ready</strong>, you get a{' '}
        <strong>60 second</strong> window — most reps wins.
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
