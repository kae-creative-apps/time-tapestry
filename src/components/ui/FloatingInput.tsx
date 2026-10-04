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
  ({ id, label, className, inputRef, value, defaultValue, placeholder, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = String(value ?? defaultValue ?? '').length > 0;

    // deliberate: placeholder is intentionally discarded; the label acts as the
    // placeholder when the input is empty and unfocused, then floats above on focus/value.
    void placeholder;

    return (
      <div className={cn('relative', className)}>
        <motion.label
          htmlFor={id}
          initial={false}
          animate={{
            y: hasValue || isFocused ? -28 : 0,
            scale: hasValue || isFocused ? 0.85 : 1
          }}
          transition={{ duration: 0.2 }}
          className={cn("pointer-events-none absolute left-4 top-3.5 origin-left font-sans text-sm", isFocused ? "text-oxblood" : "text-ink-500")}
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
          className="h-14 w-full rounded-md border border-warmgray-300 bg-paper-50 px-4 pt-2 font-sans text-base text-ink outline-none transition-all duration-200 focus:border-oxblood focus:ring-2 focus:ring-oxblood/15"
          {...props}
        />
      </div>
    );
  }
);

FloatingInput.displayName = 'FloatingInput';
