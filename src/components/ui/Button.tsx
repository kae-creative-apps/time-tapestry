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
          'inline-flex min-h-[48px] items-center justify-center rounded-md px-6 py-2.5 font-sans text-sm font-medium tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
          variant === 'primary' &&
            'bg-oxblood text-paper shadow-sm hover:bg-oxblood-600 hover:shadow',
          variant === 'secondary' &&
            'border border-oxblood bg-transparent text-oxblood hover:bg-oxblood-700/10 hover:text-oxblood-700 active:bg-oxblood-700/20',
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
