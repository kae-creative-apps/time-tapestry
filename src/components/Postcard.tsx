'use client';

import { QRCodeSVG } from 'qrcode.react';
import { BrandLockup } from './Logo';
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
          'rounded-xl border border-warmgray-200 bg-paper-50 p-6'
        )}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center justify-center rounded-lg bg-paper-100 p-6 text-center">
            {chapterIndex === 0 && (
              <div className="mb-4 rounded-full bg-oxblood px-3 py-1 font-sans text-[10px] font-medium uppercase tracking-[0.12em] text-paper">
                Welcome
              </div>
            )}
            {frontTitle && (
              <h2 className="mb-3 font-serif text-lg text-ink">{frontTitle}</h2>
            )}
            <p className="font-serif text-base leading-relaxed text-ink">
              {frontContent}
            </p>
            <BrandLockup className="mt-8" />
          </div>

          <div className="flex flex-col justify-between gap-6 border-t border-warmgray-200 p-6 md:border-l md:border-t-0 md:pl-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-warmgray-500">
                  Postmarked
                </p>
                <p className="font-serif text-base text-ink">{sentDate}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-warmgray-300 bg-paper-50 text-oxblood">
                <BrandLockup variant="mark" />
              </div>
            </div>

            <p className="font-serif text-base leading-relaxed text-ink">
              {backContent}
            </p>

            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={qrValue} size={72} level="M" />
              <p className="max-w-[160px] text-center font-sans text-[11px] text-warmgray-500">
                Scan to read the full keepsake.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-warmgray-200 pt-4">
          <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-warmgray-500">
            Card {chapterIndex + 1} of 5
          </p>
          <p className="font-sans text-[11px] text-warmgray-500">
            Thick matte stock.
          </p>
        </div>
      </div>
    </div>
  );
}
