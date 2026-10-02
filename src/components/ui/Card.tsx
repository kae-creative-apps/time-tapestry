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
        'rounded-sm border border-warmgray-300 bg-paper-50 p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}
