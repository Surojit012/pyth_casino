'use client';

import Link from 'next/link';
import styles from './GameCard.module.css';

import { ArrowRight } from 'lucide-react';

interface GameCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tag?: string;
  size?: 'default' | 'featured';
  ctaLabel?: 'Enter' | 'Play';
}

export default function GameCard({ href, icon, title, description, tag, size = 'default', ctaLabel = 'Enter' }: GameCardProps) {
  return (
    <Link href={href} className={`${styles.card} ${styles[size]}`}>
      {tag && <span className={styles.tag}>{tag}</span>}
      <div className={styles.iconWrap}>
        <span className={styles.icon}>{icon}</span>
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <div className={styles.cta}>
        <span className={styles.ctaText}>{ctaLabel}</span>
        <span className={styles.ctaArrow}><ArrowRight size={16} /></span>
      </div>
    </Link>
  );
}
