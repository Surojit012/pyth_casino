'use client';

import { useLiveBets } from '@/context/LiveBetsContext';
import styles from './LiveBetsFeed.module.css';

function shortenWallet(wallet: string) {
  if (!wallet) return 'Unknown';
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

import { useState, useEffect } from 'react';

export default function LiveBetsFeed() {
  const { bets } = useLiveBets();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <section className={styles.feed}>
        <div className={styles.header}>
          <h3>Live Bets Feed</h3>
          <span>Loading...</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.feed}>
      <div className={styles.header}>
        <h3>Live Bets Feed</h3>
        <span>Last {bets.length} / 10</span>
      </div>

      <div className={styles.list}>
        {bets.map((bet) => (
          <article
            key={bet.id}
            className={`${styles.item} ${bet.status === 'confirmed' ? styles.confirmed : styles.pending} ${bet.justConfirmed ? styles.confirmGlow : ''}`}
          >
            <div className={styles.main}>
              <span className={styles.wallet}>{shortenWallet(bet.wallet)}</span>
              <span className={bet.direction === 'UP' ? styles.up : styles.down}>{bet.direction}</span>
              <span className={styles.amount}>{bet.amountSol.toFixed(3)} SOL</span>
            </div>
            <div className={styles.meta}>
              <span className={bet.status === 'confirmed' ? styles.confirmedLabel : styles.pendingLabel}>
                {bet.status}
              </span>
              <span>{formatTime(bet.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
