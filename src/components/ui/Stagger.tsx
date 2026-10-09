'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface StaggerProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  when?: 'mount' | 'view';
}

export function Stagger({ children, className = '', stagger = 0.1, delay = 0, when = 'mount' }: StaggerProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate={when === 'mount' ? "visible" : undefined}
      whileInView={when === 'view' ? "visible" : undefined}
      viewport={when === 'view' ? { once: true, amount: 0.15 } : undefined}
      variants={{
        visible: { transition: { staggerChildren: reduceMotion ? 0 : stagger, delayChildren: reduceMotion ? 0 : delay } },
        hidden: {}
      }}
      data-reveal=""
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 20 },
        visible: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' } }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
