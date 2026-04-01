'use client';

import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      <span className={styles.trigger}>{children}</span>
      <span className={styles.tip} role="tooltip">
        {content}
      </span>
    </span>
  );
}
