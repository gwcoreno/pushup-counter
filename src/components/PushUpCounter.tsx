'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DrawingUtils,
  FilesetResolver,
  NormalizedLandmark,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';

const MEDIAPIPE_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const DOWN_ANGLE = 90;
const UP_ANGLE = 160;
const SHALLOW_BEND = 110;
const MIN_VISIBILITY = 0.5;

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

export default function PushUpCounter() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('up');
  const minAngleRef = useRef<number>(180);

  const [count, setCount] = useState(0);
  const [feedback, setFeedback] = useState('Get into push-up position');
  const [status, setStatus] = useState<Status>('idle');
  const [loadingMsg, setLoadingMsg] = useState('Loading…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopTracks = () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
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

      const angles: number[] = [];
      if (visibleEnough(lm[11]) && visibleEnough(lm[13]) && visibleEnough(lm[15])) {
        angles.push(elbowAngle(lm[11], lm[13], lm[15]));
      }
      if (visibleEnough(lm[12]) && visibleEnough(lm[14]) && visibleEnough(lm[16])) {
        angles.push(elbowAngle(lm[12], lm[14], lm[16]));
      }

      if (angles.length > 0) {
        const avg = angles.reduce((s, n) => s + n, 0) / angles.length;
        minAngleRef.current = Math.min(minAngleRef.current, avg);

        if (phaseRef.current === 'up' && avg < DOWN_ANGLE) {
          phaseRef.current = 'down';
          setFeedback('Going down…');
        } else if (phaseRef.current === 'down' && avg > UP_ANGLE) {
          phaseRef.current = 'up';
          const deepEnough = minAngleRef.current < DOWN_ANGLE;
          setCount((c) => c + 1);
          setFeedback(deepEnough ? 'Good rep!' : 'Rep counted — try to go lower next time');
          minAngleRef.current = 180;
        } else if (phaseRef.current === 'down' && avg > SHALLOW_BEND && minAngleRef.current > DOWN_ANGLE) {
          setFeedback('Go lower');
        }
      } else {
        setFeedback('Make sure your arms are visible');
      }
    } else {
      setFeedback('No pose detected — step into frame');
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    setErrorMsg(null);
    setStatus('loading');
    try {
      if (!landmarkerRef.current) {
        setLoadingMsg('Loading pose model (~8MB)…');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }

      setLoadingMsg('Requesting camera…');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });

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

  const stop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopTracks();
    setStatus('idle');
    setFeedback('Get into push-up position');
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
            Click Start to begin
          </div>
        )}
      </div>

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
              onClick={stop}
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

      {errorMsg && (
        <p className="text-red-500 text-sm max-w-[640px] text-center">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
