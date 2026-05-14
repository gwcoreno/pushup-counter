'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DrawingUtils,
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import { saveWorkoutSession } from '@/app/actions/sessions';

const MEDIAPIPE_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const DOWN_ANGLE = 90;
const UP_ANGLE = 160;
const SHALLOW_BEND = 110;
const MIN_VISIBILITY = 0.5;

/** MediaPipe pose indices: L shoulder/elbow/wrist, R shoulder/elbow/wrist */
const L_SH = 11;
const L_EL = 13;
const L_WR = 15;
const R_SH = 12;
const R_EL = 14;
const R_WR = 16;

const POSE_LOG_INTERVAL_MS = 400;

type Phase = 'up' | 'down';
type Status = 'idle' | 'loading' | 'running' | 'error';

function elbowAngle(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
): number {
  const ba = { x: shoulder.x - elbow.x, y: shoulder.y - elbow.y };
  const bc = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  if (mag === 0) return 180;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function visibleEnough(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
  return !!lm && (lm.visibility ?? 0) >= MIN_VISIBILITY;
}

function lmPoint(lm: NormalizedLandmark[] | undefined, i: number) {
  const p = lm?.[i];
  if (!p) return null;
  return {
    x: Number(p.x.toFixed(4)),
    y: Number(p.y.toFixed(4)),
    z: Number(p.z.toFixed(4)),
    visibility: Number((p.visibility ?? 0).toFixed(3)),
  };
}

/** `navigator.mediaDevices` is missing on non-secure origins (HTTP except localhost) and some in-app browsers. */
function getUserMediaCompat(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Camera is only available in the browser.'));
  }
  if (!window.isSecureContext) {
    return Promise.reject(
      new Error(
        'Camera needs a secure page (HTTPS). Open this app with an https:// link (localhost is OK for local dev).',
      ),
    );
  }

  const modern = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (modern) {
    return modern(constraints);
  }

  type LegacyGetUserMedia = (
    c: MediaStreamConstraints,
    ok: (s: MediaStream) => void,
    err: (e: Error) => void,
  ) => void;
  const n = navigator as Navigator & {
    getUserMedia?: LegacyGetUserMedia;
    webkitGetUserMedia?: LegacyGetUserMedia;
    mozGetUserMedia?: LegacyGetUserMedia;
  };
  const legacy =
    n.getUserMedia?.bind(n) ?? n.webkitGetUserMedia?.bind(n) ?? n.mozGetUserMedia?.bind(n);
  if (legacy) {
    return new Promise((resolve, reject) => {
      legacy(constraints, resolve, reject);
    });
  }

  return Promise.reject(
    new Error(
      'Camera API is not available here. Try a normal browser (not an in-app web view), or update your browser.',
    ),
  );
}

export type PushUpCounterProps = {
  /** When set, use this stream instead of opening a new camera (e.g. 1v1 battle). */
  sharedVideoStream?: MediaStream | null;
  /** When false, pose is drawn but reps are not counted (pre-battle warmup). */
  repCountingEnabled?: boolean;
  /** Solo saves sessions on stop; battle skips that. */
  battleMode?: boolean;
  /** Increment to auto-run start() once a shared stream is available (battle). */
  countStartSignal?: number;
  showControls?: boolean;
  onRepCountChange?: (count: number) => void;
};

export default function PushUpCounter({
  sharedVideoStream = null,
  repCountingEnabled = true,
  battleMode = false,
  countStartSignal = 0,
  showControls = true,
  onRepCountChange,
}: PushUpCounterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('up');
  const minAngleRef = useRef<number>(180);
  const lastPoseLogAtRef = useRef(0);
  const sessionStartIsoRef = useRef<string | null>(null);
  const countRef = useRef(0);
  const sharedStreamRef = useRef<MediaStream | null>(null);
  const repCountingEnabledRef = useRef(repCountingEnabled);
  const ownsCameraStreamRef = useRef(true);
  const prevRepCountingEnabledRef = useRef(true);

  const [count, setCount] = useState(0);
  const [feedback, setFeedback] = useState('Get into push-up position');
  const [status, setStatus] = useState<Status>('idle');
  const [loadingMsg, setLoadingMsg] = useState('Loading…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionSaveHint, setSessionSaveHint] = useState<string | null>(null);

  useEffect(() => {
    sharedStreamRef.current = sharedVideoStream;
    ownsCameraStreamRef.current = !sharedVideoStream;
  }, [sharedVideoStream]);

  useEffect(() => {
    repCountingEnabledRef.current = repCountingEnabled;
    if (repCountingEnabled && !prevRepCountingEnabledRef.current) {
      setCount(0);
      phaseRef.current = 'up';
      minAngleRef.current = 180;
      setFeedback('Go!');
    }
    prevRepCountingEnabledRef.current = repCountingEnabled;
  }, [repCountingEnabled]);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    onRepCountChange?.(count);
  }, [count, onRepCountChange]);

  const stopTracks = () => {
    const video = videoRef.current;
    if (!video?.srcObject) return;
    if (ownsCameraStreamRef.current) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
    video.srcObject = null;
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopTracks();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  const loop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const result = landmarker.detectForVideo(video, performance.now());

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      const drawer = new DrawingUtils(ctx);
      drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
        color: '#FFFFFF',
        lineWidth: 3,
      });
      drawer.drawLandmarks(lm, {
        color: '#FF3B30',
        lineWidth: 1,
        radius: 3,
      });

      const leftOk =
        visibleEnough(lm[L_SH]) && visibleEnough(lm[L_EL]) && visibleEnough(lm[L_WR]);
      const rightOk =
        visibleEnough(lm[R_SH]) && visibleEnough(lm[R_EL]) && visibleEnough(lm[R_WR]);

      const angles: number[] = [];
      let leftAngle: number | null = null;
      let rightAngle: number | null = null;
      if (leftOk) {
        leftAngle = elbowAngle(lm[L_SH], lm[L_EL], lm[L_WR]);
        angles.push(leftAngle);
      }
      if (rightOk) {
        rightAngle = elbowAngle(lm[R_SH], lm[R_EL], lm[R_WR]);
        angles.push(rightAngle);
      }

      if (angles.length > 0) {
        const avg = angles.reduce((s, n) => s + n, 0) / angles.length;
        if (repCountingEnabledRef.current) {
          const phaseBefore = phaseRef.current;
          minAngleRef.current = Math.min(minAngleRef.current, avg);

          let repDepthMin: number | undefined;
          if (phaseRef.current === 'up' && avg < DOWN_ANGLE) {
            phaseRef.current = 'down';
            setFeedback('Going down…');
          } else if (phaseRef.current === 'down' && avg > UP_ANGLE) {
            repDepthMin = minAngleRef.current;
            phaseRef.current = 'up';
            const deepEnough = repDepthMin < DOWN_ANGLE;
            setCount((c) => c + 1);
            setFeedback(deepEnough ? 'Good rep!' : 'Rep counted — try to go lower next time');
            minAngleRef.current = 180;
          } else if (phaseRef.current === 'down' && avg > SHALLOW_BEND && minAngleRef.current > DOWN_ANGLE) {
            setFeedback('Go lower');
          }

          const phaseAfter = phaseRef.current;
          const repJustCounted = phaseBefore === 'down' && phaseAfter === 'up';
          const phaseEnteredDown = phaseBefore === 'up' && phaseAfter === 'down';
          const now = performance.now();
          const throttleOk = now - lastPoseLogAtRef.current >= POSE_LOG_INTERVAL_MS;
          if (repJustCounted || phaseEnteredDown || throttleOk) {
            lastPoseLogAtRef.current = now;
            console.log('[pushup-pose]', {
              event: repJustCounted
                ? 'rep_counted'
                : phaseEnteredDown
                  ? 'phase_down'
                  : 'tick',
              phase: phaseAfter,
              phaseBefore,
              angles: { leftDeg: leftAngle, rightDeg: rightAngle, avgDeg: Number(avg.toFixed(1)) },
              minAngleThisRep: repJustCounted
                ? Number((repDepthMin ?? avg).toFixed(1))
                : Number(minAngleRef.current.toFixed(1)),
              thresholds: { DOWN_ANGLE, UP_ANGLE, SHALLOW_BEND, MIN_VISIBILITY },
              visibilityOk: { leftArm: leftOk, rightArm: rightOk },
              landmarks: {
                left: { sh: lmPoint(lm, L_SH), el: lmPoint(lm, L_EL), wr: lmPoint(lm, L_WR) },
                right: { sh: lmPoint(lm, R_SH), el: lmPoint(lm, R_EL), wr: lmPoint(lm, R_WR) },
              },
            });
          }
        }
      } else {
        setFeedback('Make sure your arms are visible');
        const now = performance.now();
        if (now - lastPoseLogAtRef.current >= POSE_LOG_INTERVAL_MS) {
          lastPoseLogAtRef.current = now;
          console.log('[pushup-pose]', {
            event: 'arms_not_visible_enough',
            thresholds: { MIN_VISIBILITY },
            landmarks: {
              left: { sh: lmPoint(lm, L_SH), el: lmPoint(lm, L_EL), wr: lmPoint(lm, L_WR) },
              right: { sh: lmPoint(lm, R_SH), el: lmPoint(lm, R_EL), wr: lmPoint(lm, R_WR) },
            },
          });
        }
      }
    } else {
      setFeedback('No pose detected — step into frame');
      const now = performance.now();
      if (now - lastPoseLogAtRef.current >= POSE_LOG_INTERVAL_MS) {
        lastPoseLogAtRef.current = now;
        console.log('[pushup-pose]', { event: 'no_pose', landmarksCount: result.landmarks.length });
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    setErrorMsg(null);
    setStatus('loading');
    try {
      if (!landmarkerRef.current) {
        setLoadingMsg('Loading pose model…');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }

      setLoadingMsg(sharedStreamRef.current ? 'Starting camera…' : 'Requesting camera…');
      const stream =
        sharedStreamRef.current ??
        (await getUserMediaCompat({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        }));

      const video = videoRef.current;
      if (!video) throw new Error('Video element not mounted');

      video.srcObject = stream;
      video.onloadedmetadata = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        video.play().catch((err) => {
          console.error('video.play() failed', err);
          setErrorMsg(`video.play() failed: ${err.message ?? err}`);
        });
      };

      phaseRef.current = 'up';
      minAngleRef.current = 180;
      if (!battleMode) {
        sessionStartIsoRef.current = new Date().toISOString();
      } else {
        sessionStartIsoRef.current = null;
      }
      setStatus('running');
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error('start() failed', err);
      stopTracks();
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : 'Failed to start camera';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!countStartSignal || !sharedStreamRef.current) return;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when parent signals with stream
  }, [countStartSignal]);

  const stop = async () => {
    const startIso = sessionStartIsoRef.current;
    const hadWorkoutSession = startIso !== null;
    const endIso = new Date().toISOString();
    const repsAtStop = countRef.current;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopTracks();
    sessionStartIsoRef.current = null;
    setStatus('idle');
    setFeedback('Get into push-up position');
    setSessionSaveHint(null);

    if (hadWorkoutSession && startIso && !battleMode) {
      const result = await saveWorkoutSession({
        startTimeIso: startIso,
        endTimeIso: endIso,
        reps: repsAtStop,
      });
      if (result.ok) {
        setSessionSaveHint('Workout saved to your account.');
      } else if (result.error !== 'Not signed in.') {
        setSessionSaveHint(`Could not save workout: ${result.error}`);
      }
    }
  };

  const reset = () => {
    setCount(0);
    phaseRef.current = 'up';
    minAngleRef.current = 180;
    setFeedback('Counter reset');
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full max-w-[640px] aspect-[4/3] bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full -scale-x-100 pointer-events-none"
        />
        <div className="absolute top-3 right-3 bg-black/70 text-white px-4 py-2 rounded-lg text-3xl font-mono tabular-nums">
          {count}
        </div>
        {status === 'running' && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap">
            {feedback}
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-lg">
            {loadingMsg}
          </div>
        )}
        {status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
            {showControls ? 'Click Start to begin' : 'Preparing camera…'}
          </div>
        )}
      </div>

      {showControls && (
      <div className="flex gap-3">
        {status === 'idle' || status === 'error' ? (
          <button
            onClick={start}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg"
          >
            Start
          </button>
        ) : null}
        {status === 'loading' && (
          <button
            disabled
            className="bg-gray-400 text-white py-2 px-6 rounded-lg cursor-not-allowed"
          >
            Loading…
          </button>
        )}
        {status === 'running' && (
          <>
            <button
              type="button"
              onClick={() => void stop()}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-lg"
            >
              Stop
            </button>
            <button
              onClick={reset}
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-lg"
            >
              Reset
            </button>
          </>
        )}
      </div>
      )}

      {errorMsg && (
        <p className="text-red-500 text-sm max-w-[640px] text-center">
          {errorMsg}
        </p>
      )}
      {sessionSaveHint && (
        <p className="text-green-600 text-sm max-w-[640px] text-center">{sessionSaveHint}</p>
      )}
    </div>
  );
}
