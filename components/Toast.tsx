'use client';

import { useEffect } from 'react';
import styles from './Toast.module.css';

interface ToastProps {
  open: boolean;
  message: string;
  onClose: () => void;
  durationMs?: number;
  actionLabel?: string;
  actionHref?: string;
}

export default function Toast({
  open,
  message,
  onClose,
  durationMs = 2200,
  actionLabel,
  actionHref,
}: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [open, onClose, durationMs]);

  if (!open) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && actionHref ? (
        <a href={actionHref} target="_blank" rel="noreferrer" className={styles.toastAction}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}
