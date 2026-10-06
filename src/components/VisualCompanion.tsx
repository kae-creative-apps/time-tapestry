"use client";

import Link from "next/link";

export function VisualCompanion({ text }: { text: string }) {
  return (
    <div className="relative rounded-lg bg-ink p-6 text-paper">
      <p className="mb-6 font-serif text-quote leading-relaxed">
        {text || "Your interview questions will appear here."}
      </p>
      <p className="text-sm leading-relaxed text-paper">
        Voice playback is unavailable in this earlier interview.{" "}
        <Link href="/share" className="underline underline-offset-4">
          Begin sharing your story.
        </Link>
      </p>
    </div>
  );
}
