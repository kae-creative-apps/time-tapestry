'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from './ui/Button';
import { formatDuration } from '@/lib/utils';

const MAX_SECONDS = 90;

export function VoiceRecorder({ onDone }: { onDone: (blob: Blob) => void }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRef.current = recorder;
    chunksRef.current = [];
    blobRef.current = null;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      blobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
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
  }, [cleanup]);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const reRecord = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setSeconds(0);
    setPhase('idle');
  }, [audioUrl]);

  const useRecording = useCallback(() => {
    if (blobRef.current) {
      onDone(blobRef.current);
    }
  }, [onDone]);

  return (
    <div className="rounded-lg border border-warmgray-200 bg-paper-50/90 p-6 text-center shadow-soft">
      {phase === 'idle' && (
        <>
          <p className="mb-1 font-serif text-lg text-ink">
            Tap record, then speak for up to 90 seconds.
          </p>
          <p className="mb-5 font-sans text-sm text-warmgray-500">
            Take your time. There are no wrong answers.
          </p>
          <Button onClick={start} aria-label="Start recording">
            Record
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
          <Button
            onClick={stop}
            variant="secondary"
            aria-label="Stop recording"
          >
            Stop
          </Button>
        </>
      )}

      {phase === 'review' && audioUrl && (
        <>
          <p className="mb-4 font-serif text-lg text-ink">Here is what you recorded.</p>
          <audio src={audioUrl} controls className="mx-auto mb-6 w-full rounded-md" />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={reRecord} variant="secondary">
              Re-record
            </Button>
            <Button onClick={useRecording}>Use this recording</Button>
          </div>
        </>
      )}
    </div>
  );
}
