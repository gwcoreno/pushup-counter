'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  battleFinalize,
  battleGetMatch,
  battleMarkReady,
  battleUpdateReps,
  type MatchRow,
} from '@/app/actions/battle';
import PushUpCounter from '@/components/PushUpCounter';
import { createClient } from '@/utils/supabase/client';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

async function getLocalCamera(): Promise<MediaStream> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    throw new Error('Camera requires HTTPS (or localhost).');
  }
  const g = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!g) throw new Error('Camera not available in this browser.');
  return g({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
}

type BattleArenaProps = {
  matchId: string;
  userId: string;
  initialMatch: MatchRow;
  isOfferer: boolean;
};

export function BattleArena({ matchId, userId, initialMatch, isOfferer }: BattleArenaProps) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchRow>(initialMatch);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [pcState, setPcState] = useState<string>('new');
  const [poseStartSignal, setPoseStartSignal] = useState(0);
  const [repCountingEnabled, setRepCountingEnabled] = useState(false);
  const [localReps, setLocalReps] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [result, setResult] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [remoteLive, setRemoteLive] = useState(false);
  const finalizedRef = useRef(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const repSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myRepsColumn = useMemo(
    () => (userId === match.player1_id ? match.player1_reps : match.player2_reps),
    [match, userId],
  );
  const theirRepsColumn = useMemo(
    () => (userId === match.player1_id ? match.player2_reps : match.player1_reps),
    [match, userId],
  );

  const refreshMatch = useCallback(async () => {
    const m = await battleGetMatch(matchId);
    if (m) setMatch(m);
    return m;
  }, [matchId]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshMatch();
    }, 1200);
    return () => clearInterval(id);
  }, [refreshMatch]);

  useEffect(() => {
    if (match.status !== 'live' || !match.starts_at || !match.ends_at) return;
    const startMs = new Date(match.starts_at).getTime();
    const endMs = new Date(match.ends_at).getTime();
    if (nowTick >= startMs && !repCountingEnabled) {
      setRepCountingEnabled(true);
    }
    if (nowTick >= endMs && match.status === 'live' && !finalizedRef.current) {
      finalizedRef.current = true;
      void (async () => {
        const finalized = await battleFinalize(matchId);
        if (finalized) {
          setMatch(finalized);
          if (finalized.winner_id === null) {
            setResult("Time's up — tie game.");
          } else if (finalized.winner_id === userId) {
            setResult('You win!');
          } else {
            setResult('Opponent wins.');
          }
        }
      })();
    }
  }, [match, matchId, nowTick, repCountingEnabled, userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await getLocalCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        setPoseStartSignal((n) => n + 1);
      } catch (e) {
        if (!cancelled) {
          setCamError(e instanceof Error ? e.message : 'Camera failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!localStream) return;

    const supabase = createClient();
    const channel = supabase.channel(`battle-webrtc:${matchId}`, {
      config: { broadcast: { self: true } },
    });

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onconnectionstatechange = () => setPcState(pc.connectionState);

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        setRemoteLive(true);
        void remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'ice', candidate: ev.candidate.toJSON() } satisfies SignalPayload,
      });
    };

    const handleRemote = async (payload: SignalPayload) => {
      try {
        if (payload.type === 'offer' && !isOfferer) {
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'answer', sdp: answer.sdp! },
          });
        } else if (payload.type === 'answer' && isOfferer) {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        } else if (payload.type === 'ice' && payload.candidate) {
          await pc.addIceCandidate(payload.candidate);
        }
      } catch (e) {
        console.error('[webrtc]', e);
      }
    };

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      void handleRemote(payload as SignalPayload);
    });

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      if (!isOfferer) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'offer', sdp: offer.sdp! },
        });
      } catch (e) {
        console.error('[webrtc offer]', e);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      pc.close();
      pcRef.current = null;
    };
  }, [isOfferer, localStream, matchId]);

  useEffect(() => {
    if (!repCountingEnabled || match.status !== 'live') return;
    if (repSendTimerRef.current) clearTimeout(repSendTimerRef.current);
    repSendTimerRef.current = setTimeout(() => {
      void (async () => {
        const m = await battleUpdateReps(matchId, localReps);
        if (m) setMatch(m);
      })();
    }, 500);
    return () => {
      if (repSendTimerRef.current) clearTimeout(repSendTimerRef.current);
    };
  }, [localReps, match.status, matchId, repCountingEnabled]);

  const onReadyClick = async () => {
    setReadyBusy(true);
    try {
      const m = await battleMarkReady(matchId);
      if (m) setMatch(m);
    } finally {
      setReadyBusy(false);
    }
  };

  const startsAtMs = match.starts_at ? new Date(match.starts_at).getTime() : null;
  const endsAtMs = match.ends_at ? new Date(match.ends_at).getTime() : null;
  const preCountdown =
    match.status === 'live' && startsAtMs && nowTick < startsAtMs
      ? Math.max(0, Math.ceil((startsAtMs - nowTick) / 1000))
      : null;
  const battleSecondsLeft =
    match.status === 'live' && endsAtMs && nowTick >= (startsAtMs ?? 0)
      ? Math.max(0, Math.ceil((endsAtMs - nowTick) / 1000))
      : null;

  const iAmP1 = userId === match.player1_id;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/battle" className="text-sm text-blue-600 hover:underline">
          ← Leave match flow
        </Link>
        <div className="text-sm text-muted">
          WebRTC: <span className="text-foreground">{pcState}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 justify-between items-baseline">
        <h1 className="text-xl font-bold">Battle</h1>
        <div className="flex gap-6 text-sm">
          <span>
            You:{' '}
            <strong className="tabular-nums">{Math.max(localReps, myRepsColumn)}</strong> reps
          </span>
          <span>
            Opponent: <strong className="tabular-nums">{theirRepsColumn}</strong> reps
          </span>
        </div>
      </div>

      {match.status === 'pairing' && (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-surface">
          <p className="text-sm text-muted">
            When your camera preview is running and you can see the peer (or are still connecting),
            tap <strong>Ready</strong>. The 60-second rep window starts 3 seconds after{' '}
            <em>both</em> players are ready.
          </p>
          <button
            type="button"
            disabled={readyBusy || (iAmP1 ? match.player1_ready : match.player2_ready)}
            onClick={() => void onReadyClick()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-6 rounded-lg"
          >
            {iAmP1 && match.player1_ready
              ? 'You are ready'
              : !iAmP1 && match.player2_ready
                ? 'You are ready'
                : 'Ready'}
          </button>
        </div>
      )}

      {match.status === 'live' && (
        <div className="rounded-lg border border-border px-4 py-3 bg-surface text-center">
          {preCountdown !== null && preCountdown > 0 && (
            <p className="text-lg font-semibold">Starting in {preCountdown}…</p>
          )}
          {battleSecondsLeft !== null && (preCountdown === null || preCountdown === 0) && (
            <p className="text-lg font-semibold tabular-nums">{battleSecondsLeft}s left</p>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border p-4 text-center space-y-3">
          <p className="text-lg font-semibold">{result}</p>
          <button
            type="button"
            onClick={() => router.push('/battle')}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm"
          >
            Find another match
          </button>
        </div>
      )}

      {camError && <p className="text-red-600 text-sm">{camError}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted mb-2">Peer video</h2>
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden max-h-[280px]">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {!remoteLive && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm p-4 text-center">
                Waiting for peer stream…
              </div>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted mb-2">You (pose + reps)</h2>
          {localStream ? (
            <PushUpCounter
              sharedVideoStream={localStream}
              repCountingEnabled={repCountingEnabled}
              battleMode
              countStartSignal={poseStartSignal}
              showControls={false}
              onRepCountChange={setLocalReps}
            />
          ) : (
            <p className="text-sm text-muted">Opening camera…</p>
          )}
        </div>
      </div>
    </main>
  );
}
