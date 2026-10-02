'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from './ui/Button';
import { formatDuration } from '@/lib/utils';

const MAX_SECONDS = 60;

function getSupportedMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return 'video/webm';
}

export function VideoRecorder({
  sessionId,
  onDone,
  onStartUpload
}: {
  sessionId: string;
  onDone: (videoUrl: string) => void;
  onStartUpload?: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 800_000,
        audioBitsPerSecond: 64_000
      });
      mediaRef.current = recorder;
      chunksRef.current = [];
      blobRef.current = null;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = URL.createObjectURL(blob);
          videoRef.current.controls = true;
        }
        setPhase('review');
        cleanup();
      };

      recorder.start();
      setPhase('recording');
      setSeconds(0);
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            recorder.stop();
            return MAX_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError('Could not access camera. You may need to allow permission.');
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const reRecord = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.controls = false;
    }
    setSeconds(0);
    setPhase('idle');
  }, []);

  const useRecording = useCallback(async () => {
    if (!blobRef.current) return;

    onStartUpload?.();
    setPhase('uploading');
    setError('');
    try {
      const result = await upload(`videos/${sessionId}-${Date.now()}.webm`, blobRef.current, {
        access: 'public',
        handleUploadUrl: '/api/video/upload-url',
        clientPayload: JSON.stringify({ sessionId })
      });
      onDone(result.url);
    } catch (err) {
      console.error('Video upload failed:', err);
      setError('Something went wrong saving your video. Please try again.');
      setPhase('review');
    }
  }, [sessionId, onDone, onStartUpload]);

  return (
    <div className="rounded-lg border border-warmgray-200 bg-paper-50/90 p-6 text-center shadow-soft">
      {error && <p className="mb-4 text-oxblood">{error}</p>}
      <video
        ref={videoRef}
        className="mx-auto mb-4 w-full max-w-md rounded-md bg-ink-800"
        muted={phase !== 'review'}
        playsInline
      />
      {phase === 'idle' && (
        <>
          <p className="mb-4 font-serif text-lg text-ink">
            Tap record to start your video message.
          </p>
          <Button onClick={start} aria-label="Start video recording">
            Record video
          </Button>
        </>
      )}
      {phase === 'recording' && (
        <>
          <p className="mb-2 font-serif text-xl text-oxblood">
            Recording... {formatDuration(seconds)}
          </p>
          <p className="mb-6 font-sans text-sm text-warmgray-500">
            {MAX_SECONDS - seconds} seconds left
          </p>
          <Button onClick={stop} variant="secondary">
            Stop
          </Button>
        </>
      )}
      {phase === 'review' && (
        <>
          <p className="mb-4 font-serif text-lg text-ink">Here is your video.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={reRecord} variant="secondary">
              Re-record
            </Button>
            <Button onClick={() => void useRecording()}>Use this video</Button>
          </div>
        </>
      )}
      {phase === 'uploading' && (
        <p className="font-sans text-ink-400">Saving your video...</p>
      )}
    </div>
  );
}
