"use client";

import Link from "next/link";

export function VideoRecorder(_props: {
  sessionId: string;
  onDone: (videoUrl: string) => void;
  onStartUpload?: () => void;
}) {
  return (
    <div className="rounded-lg border border-warmgray-200 bg-paper-50 p-6 text-center">
      <p className="font-display text-xl font-medium text-ink">
        This earlier recorder has been retired.
      </p>
      <p className="mt-3 text-base leading-7 text-ink-500">
        Use a private collection to record and save your story. If you already
        have a collection, open its private interview link.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link href="/share" className="brand-button-primary">
          Share my story
        </Link>
        <Link href="/request" className="brand-button-secondary">
          Request a story
        </Link>
      </div>
    </div>
  );
}
