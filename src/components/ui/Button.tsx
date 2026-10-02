'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex min-h-[64px] items-center justify-center rounded-sm px-8 py-4 font-serif text-lg transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-oxblood-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50',
          variant === 'primary' &&
            'bg-oxblood text-paper shadow-sm hover:bg-oxblood-600',
          variant === 'secondary' &&
            'border-2 border-oxblood bg-transparent text-oxblood hover:bg-oxblood-700 hover:text-paper',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
