import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-warmgray-200 bg-paper-50 p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
