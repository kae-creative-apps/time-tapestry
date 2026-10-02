'use client';

import { useEffect, useState } from 'react';

export function DemoBanner() {
  const [mock, setMock] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setMock(Boolean(data.mock)))
      .catch(() => setMock(false));
  }, []);

  if (!mock) return null;

  return (
    <div className="w-full bg-oxblood px-4 py-2 text-center">
      <p className="font-sans text-xs font-medium tracking-[0.06em] text-paper">
        Demo mode — some features are simulated. Add API keys to .env.local for full functionality.
      </p>
    </div>
  );
}
