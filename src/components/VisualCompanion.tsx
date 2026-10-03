'use client';

import { Button } from './ui/Button';

export function VisualCompanion({ text, isSpeaking }: { text: string; isSpeaking?: boolean }) {
  const replay = () => {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="relative rounded-lg bg-ink p-6 text-paper">
      {isSpeaking && (
        <span className="absolute right-4 top-4 flex items-center gap-2 font-sans text-xs text-paper-200">
          <span className="inline-block h-2 w-2 rounded-full bg-paper breathing" />
          Speaking
        </span>
      )}
      <p className="mb-6 font-serif text-quote leading-relaxed">
        {text || 'Your interviewer will speak here.'}
      </p>
      <Button
        variant="secondary"
        onClick={replay}
        className="border-paper-200 text-paper hover:bg-ink-600 hover:text-paper"
      >
        Replay
      </Button>
    </div>
  );
}
