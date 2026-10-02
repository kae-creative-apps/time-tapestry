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
        'rounded-lg border border-warmgray-200 bg-paper-50/90 p-6 shadow-soft transition duration-300 hover:shadow-lift',
        className
      )}
    >
      {children}
    </div>
  );
}
