'use client';

import { AudioPlayer } from './AudioPlayer';
import { Card } from './ui/Card';

export type Chapter = {
  title: string;
  content: string;
  audioUrl?: string;
};

export function StoryDisplay({
  welcome,
  chapters,
  causes,
  values,
  grandparentName,
  grandchildName,
  quotes,
  videoUrl
}: {
  welcome: string;
  chapters: Chapter[];
  causes: string[];
  values?: string[];
  grandparentName: string;
  grandchildName: string;
  quotes?: string[];
  videoUrl?: string;
}) {
  return (
    <div className="space-y-8">
      {videoUrl && (
        <Card>
          <video
            src={videoUrl}
            controls
            className="w-full rounded-md"
            poster=""
          >
            Your browser does not support video.
          </video>
        </Card>
      )}

      <Card className="border-l-4 border-l-oxblood/20">
        <p className="mb-3 font-sans text-xs uppercase tracking-[0.12em] text-oxblood-400">
          A note from {grandparentName}
        </p>
        <p className="font-serif text-lg leading-relaxed text-ink sm:text-story">
          {welcome}
        </p>
      </Card>

      {chapters.map((chapter, i) => (
        <Card key={i}>
          <p className="mb-2 font-sans text-xs uppercase tracking-[0.12em] text-warmgray-500">
            Chapter {i + 1}
          </p>
          <h2 className="mb-4 font-serif text-xl leading-snug text-ink sm:text-2xl">
            {chapter.title}
          </h2>
          <p className="mb-6 font-serif leading-relaxed text-ink sm:text-story">
            {chapter.content}
          </p>
          {chapter.audioUrl ? (
            <AudioPlayer src={chapter.audioUrl} />
          ) : (
            <AudioPlayer src={undefined} />
          )}
          {quotes && quotes[i] && (
            <blockquote className="mt-6 border-l-2 border-oxblood pl-4 font-serif text-quote text-ink">
              &ldquo;{quotes[i]}&rdquo;
            </blockquote>
          )}
        </Card>
      ))}

      <Card className="border-l-4 border-l-forest/20">
        <p className="mb-4 font-sans text-xs uppercase tracking-[0.12em] text-forest">
          What {grandparentName} valued
        </p>
        {values && values.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {values.map((value, i) => (
              <li
                key={i}
                className="rounded-md border border-warmgray-300 bg-paper px-3 py-1.5 font-serif text-sm text-ink"
              >
                {value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink">Faith, family, and generosity</p>
        )}
      </Card>

      <Card>
        <p className="mb-4 font-sans text-xs uppercase tracking-[0.12em] text-warmgray-500">
          What {grandparentName} gave to
        </p>
        <ul className="space-y-2 font-serif text-ink">
          {causes.map((cause, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-oxblood" />
              <span>{cause}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 font-sans text-sm leading-relaxed text-warmgray-500">
          {grandparentName} gave time, care, and resources to these people and places. If you ever want to learn more, the family has kept note of them here.
        </p>
      </Card>

      <Card className="border-l-4 border-l-oxblood/10">
        <p className="mb-4 font-sans text-xs uppercase tracking-[0.12em] text-oxblood-400">
          What {grandparentName} wanted you to know
        </p>
        <p className="font-serif leading-relaxed text-ink sm:text-story">
          The life {grandparentName} lived was about more than one thing. It was faith, family, kindness, hard lessons, and small generosities. Most of all, it was about paying attention to the people around you and passing down what mattered. That is the thread {grandparentName} hoped you would carry.
        </p>
      </Card>
    </div>
  );
}
