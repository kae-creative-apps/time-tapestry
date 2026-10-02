'use client';

import { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ id, label, className, inputRef, value, defaultValue, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = String(value ?? defaultValue ?? '').length > 0;

    return (
      <div className={cn('relative', className)}>
        <motion.label
          htmlFor={id}
          initial={false}
          animate={{
            y: hasValue || isFocused ? -28 : 0,
            scale: hasValue || isFocused ? 0.85 : 1,
            color: isFocused ? '#7a2e2e' : hasValue ? '#8a7e6e' : '#a89e8e'
          }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute left-4 top-3.5 origin-left font-sans text-sm"
        >
          {label}
        </motion.label>
        <input
          ref={inputRef || ref}
          id={id}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          className="h-14 w-full rounded-md border border-warmgray-300 bg-paper-50 px-4 pt-2 font-sans text-base text-ink outline-none transition-all duration-200 focus:border-oxblood focus:shadow-[0_0_0_3px_rgba(122,46,46,0.12)]"
          {...props}
        />
      </div>
    );
  }
);

FloatingInput.displayName = 'FloatingInput';
