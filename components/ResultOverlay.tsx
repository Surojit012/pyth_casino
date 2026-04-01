'use client';

import { useEffect, useRef } from 'react';
import styles from './ResultOverlay.module.css';

type ResultVariant = 'win' | 'loss' | 'liquidated';

interface ResultOverlayProps {
  open: boolean;
  variant: ResultVariant;
  title: React.ReactNode;
  subtitle?: string;
  amountText?: string;
  icon?: React.ReactNode;
  details?: React.ReactNode;
  ctaLabel?: string;
  onAction?: () => void;
  autoHideMs?: number;
  onComplete?: () => void;
}

export default function ResultOverlay({
  open,
  variant,
  title,
  subtitle,
  amountText,
  icon,
  details,
  ctaLabel,
  onAction,
  autoHideMs = 1800,
  onComplete,
}: ResultOverlayProps) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!open || !onCompleteRef.current) return;
    const timer = setTimeout(() => {
      onCompleteRef.current?.();
    }, autoHideMs);
    return () => clearTimeout(timer);
  }, [open, autoHideMs]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} aria-live="polite">
      <div className={`${styles.card} ${styles[variant]}`}>
        {variant === 'win' ? (
          <div className={styles.confetti} aria-hidden="true">
            {Array.from({ length: 14 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : null}
        <div className={styles.icon}>{icon}</div>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {amountText && <p className={styles.amount}>{amountText}</p>}
        {details ? <div className={styles.details}>{details}</div> : null}
        {ctaLabel && onAction ? (
          <button className={`${styles.cta} micro-press`} onClick={onAction}>
            {ctaLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
