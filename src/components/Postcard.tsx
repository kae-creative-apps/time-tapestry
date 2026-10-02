'use client';

import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

export type PostcardProps = {
  frontContent: string;
  frontTitle?: string;
  backContent: string;
  sentDate: string;
  chapterIndex: number;
  sessionId: string;
  rotation?: 'rotate-1' | '-rotate-1' | 'rotate-2' | '-rotate-2';
};

const rotationClass: Record<string, string> = {
  'rotate-1': 'rotate-1',
  '-rotate-1': '-rotate-1',
  'rotate-2': 'rotate-2',
  '-rotate-2': '-rotate-2'
};

export function Postcard({
  frontContent,
  frontTitle,
  backContent,
  sentDate,
  chapterIndex,
  sessionId,
  rotation = 'rotate-1'
}: PostcardProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://timetapestry.app';
  const qrValue = `${appUrl}/keepsake/${sessionId}`;

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-xl perspective-1000',
        rotationClass[rotation]
      )}
    >
      <div
        className={cn(
          'rounded-sm border border-warmgray-300 bg-paper-50 p-6 shadow-xl',
          'postcard-paper'
        )}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-warmgray-300 p-6 text-center">
            {chapterIndex === 0 && (
              <div className="mb-4 rounded-full bg-oxblood px-3 py-1 font-sans text-xs uppercase tracking-wide text-paper">
                Welcome
              </div>
            )}
            {frontTitle && (
              <h2 className="mb-3 font-serif text-xl text-ink">{frontTitle}</h2>
            )}
            <p className="font-serif text-base leading-relaxed text-ink">
              {frontContent}
            </p>
            <div className="mt-6 h-px w-24 bg-warmgray-400" />
            <p className="mt-4 font-sans text-xs uppercase tracking-widest text-warmgray-500">
              Time Tapestry
            </p>
          </div>

          <div className="flex flex-col justify-between gap-6 border-l border-dashed border-warmgray-300 p-6 md:pl-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-sans text-xs uppercase tracking-wide text-warmgray-500">
                  Postmarked
                </p>
                <p className="font-serif text-lg text-ink">{sentDate}</p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-oxblood bg-paper text-center shadow-sm">
                <span className="font-serif text-xs font-semibold leading-none text-oxblood">
                  TT
                  <br />
                  Post
                </span>
              </div>
            </div>

            <p className="font-serif text-base leading-relaxed text-ink">
              {backContent}
            </p>

            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={qrValue} size={80} level="M" />
              <p className="max-w-[160px] text-center font-sans text-xs text-warmgray-500">
                Scan to read the full keepsake.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-dashed border-warmgray-300 pt-4">
          <p className="font-sans text-xs uppercase tracking-wide text-warmgray-500">
            Card {chapterIndex + 1} of 5
          </p>
          <p className="font-sans text-xs text-warmgray-500">
            Printed on thick matte stock.
          </p>
        </div>
      </div>
    </div>
  );
}
