'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { isLocalUrl } from '@/lib/utils';

export function AudioPlayer({ src }: { src?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!src || src.startsWith('/placeholder') || src.startsWith('mock:')) {
      setAvailable(false);
    } else {
      setAvailable(true);
    }
  }, [src]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setPlaying(true))
        .catch(() => setAvailable(false));
    }
  };

  if (!available) {
    return (
      <p className="text-sm text-warmgray-500">
        Audio narration will appear here.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setPlaying(false)}
        preload="none"
      />
      <Button
        onClick={toggle}
        variant="secondary"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? 'Pause' : 'Listen'}
      </Button>
      {isLocalUrl(src) && (
        <span className="font-sans text-xs uppercase tracking-[0.08em] text-warmgray-500">Local recording</span>
      )}
    </div>
  );
}
