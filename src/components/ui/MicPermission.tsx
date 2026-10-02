'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';

export function MicPermission({ onAllow }: { onAllow: () => void }) {
  const [denied, setDenied] = useState(false);

  const request = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      onAllow();
    } catch {
      setDenied(true);
    }
  };

  if (denied) {
    return (
      <Card>
        <h3 className="mb-3 font-serif text-xl">Microphone access is needed</h3>
        <p className="mb-6 leading-relaxed text-ink-500">
          Please enable microphone access in your browser settings, then refresh
          the page. On a phone, tap the site settings icon in your address bar.
        </p>
        <p className="mb-6 font-sans text-sm text-warmgray-500">
          If you&apos;re having trouble, ask someone you trust to sit with you.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh and try again
        </Button>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <h3 className="mb-3 font-serif text-xl">
        Next, your browser will ask to use your microphone.
      </h3>
      <p className="mb-6 leading-relaxed text-ink-500">Please tap Allow.</p>
      <p className="mb-6 font-sans text-sm text-warmgray-500">
        Your voice is only used for this interview.
      </p>
      <Button onClick={request}>I am ready</Button>
    </Card>
  );
}
