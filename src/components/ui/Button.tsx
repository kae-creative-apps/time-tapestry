'use client';

import { forwardRef, ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> & {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  children?: ReactNode;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, children, loading, disabled, ...props }, ref) => {
    const isPrimary = variant === 'primary';

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || loading ? 1 : 0.99 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'relative inline-flex min-h-[48px] items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3 font-sans text-base font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50',
          isPrimary &&
            'bg-oxblood text-paper hover:bg-oxblood-600',
          variant === 'secondary' &&
            'border border-warmgray-300 bg-paper-50 text-oxblood hover:border-oxblood hover:bg-paper-100 active:bg-paper-200',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className={isPrimary ? 'text-paper' : 'text-oxblood'} />}
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
