'use client';

import { useMemo } from 'react';
import { useMarketData } from '@/context/MarketDataContext';
import { formatPrice, ASSET_NAMES, ASSET_SYMBOLS } from '@/lib/pyth';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { SymbolIcon } from '@/components/SymbolIcon';
import styles from './MarketPulse.module.css';

const ASSETS = ['SOL'] as const;

export default function MarketPulse() {
  const { assets, sourceLabel } = useMarketData();

  const rows = useMemo(() => ASSETS.map(symbol => {
    const market = assets[symbol];
    const change = market.change15s;
    return {
      symbol,
      name: ASSET_NAMES[symbol],
      icon: ASSET_SYMBOLS[symbol],
      price: market.price,
      change,
      direction: market.direction,
      mood: market.mood,
      volatilityLevel: market.volatilityLevel,
    };
  }), [assets]);

  return (
    <section className={styles.pulse}>
      <div className={styles.header}>
        <h2 className={styles.title}>Market Pulse</h2>
        <div className={styles.headerMeta}>
          <span className={styles.live}>Live</span>
          <span className={styles.badge}>{sourceLabel}</span>
        </div>
      </div>
      <div className={styles.grid}>
        {rows.map(row => (
          <article key={row.symbol} className={styles.card}>
            <div className={styles.cardTop}>
              <div className={styles.asset}>
                <span className={styles.assetIcon}><SymbolIcon symbol={row.icon} size={20} /></span>
                <div className={styles.assetText}>
                  <strong>{row.symbol}</strong>
                  <span>{row.name}</span>
                </div>
              </div>
              <span className={`${styles.change} ${row.change >= 0 ? styles.up : styles.down}`}>
                {row.direction === 'up' ? <ArrowUpRight size={14} /> : row.direction === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />} {row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%
              </span>
            </div>
            <div className={`${styles.price} ${row.direction === 'up' ? styles.flashUp : row.direction === 'down' ? styles.flashDown : ''}`}>
              ${formatPrice(row.price)}
            </div>
            <div className={styles.meta}>
              <span className={styles.tier}>Volatility: {row.volatilityLevel}</span>
              <span className={styles.mood}>{row.mood}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
