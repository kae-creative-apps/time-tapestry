'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  when?: 'mount' | 'view';
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.6,
  className = '',
  direction = 'up',
  when = 'mount'
}: FadeInProps) {
  const reduceMotion = useReducedMotion();
  const offset = {
    up: { y: 24, x: 0 },
    down: { y: -24, x: 0 },
    left: { x: 24, y: 0 },
    right: { x: -24, y: 0 }
  }[direction];
  const shown = { opacity: 1, x: 0, y: 0 };
  const hidden = reduceMotion ? false : { opacity: 0, ...offset };
  const transition = {
    duration: reduceMotion ? 0 : duration,
    delay: reduceMotion ? 0 : delay,
    ease: 'easeOut' as const
  };

  return (
    <motion.div
      initial={hidden}
      animate={when === 'mount' ? shown : undefined}
      whileInView={when === 'view' ? shown : undefined}
      viewport={when === 'view' ? { once: true, amount: 0.18 } : undefined}
      transition={transition}
      data-reveal=""
      className={className}
    >
      {children}
    </motion.div>
  );
}
