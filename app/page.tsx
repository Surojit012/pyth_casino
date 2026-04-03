'use client';

import Link from 'next/link';
import { 
  Zap, 
  ShieldCheck, 
  Coins, 
  ArrowRight, 
  Gamepad2, 
  Target, 
  Skull,
  BarChart3,
  Dices
} from 'lucide-react';
import styles from './landing.module.css';

export default function LandingPage() {
  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.flare}></div>
        <h1 className={styles.heroTitle}>
          Where Markets Are <br /> The <span className={styles.heroAccent}>House</span>
        </h1>
        <p className={styles.heroSub}>
          The world's first Solana-native casino driven by live market volatility and cryptographic entropy. Experience real-time gameplay where every price tick matters.
        </p>
        <Link href="/lobby">
          <button className={styles.ctaButton}>
            Launch App <ArrowRight size={18} style={{ marginLeft: '12px' }} />
          </button>
        </Link>
      </section>

      {/* How It Works Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The Engine of Fair Play</h2>
        <div className={styles.grid}>
          <div className={styles.glassCard}>
            <BarChart3 size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Live Oracle Data</h3>
            <p className={styles.cardText}>
              Powered by Pyth Network's high-frequency price feeds. Our games react instantly to liquid market movements on the Solana mainnet.
            </p>
          </div>
          <div className={styles.glassCard}>
            <Zap size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Volatility Dynamics</h3>
            <p className={styles.cardText}>
              The "House Edge" isn't a fixed number. Payouts and multipliers dynamically shift based on real-time market volatility and confidence intervals.
            </p>
          </div>
          <div className={styles.glassCard}>
            <ShieldCheck size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Crypto Entropy</h3>
            <p className={styles.cardText}>
              Every spin is backed by Pyth Entropy, ensuring provably fair on-chain randomness that can be verified by anyone, anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Games Showcase Section */}
      <section className={`${styles.section} ${styles.howItWorks}`}>
        <h2 className={styles.sectionTitle}>Provably Fair Games</h2>
        <div className={styles.grid}>
          <div className={styles.glassCard}>
            <Target size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Price Roulette</h3>
            <p className={styles.cardText}>
              Bet on the split-second direction of SOL. High-velocity rounds with dynamic settlement.
            </p>
          </div>
          <div className={styles.glassCard}>
            <Gamepad2 size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Volatility Slots</h3>
            <p className={styles.cardText}>
              Experience the rush as slot multipliers expand and contract with the live market's pulse.
            </p>
          </div>
          <div className={styles.glassCard}>
            <Skull size={40} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Liquidation Game</h3>
            <p className={styles.cardText}>
              The ultimate test of survival. Manage your leverage against a rising tide of danger levels.
            </p>
          </div>
        </div>
      </section>

      {/* Trust & Transparency */}
      <section className={styles.section}>
        <div className={styles.glassCard} style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <Coins size={48} className={styles.cardIcon} style={{ margin: '0 auto 24px' }} />
          <h2 className={styles.cardTitle} style={{ fontSize: '2rem' }}>Native Solana Settlement</h2>
          <p className={styles.cardText}>
            No intermediaries. No custodians. Every bet is a direct interaction with the Solana blockchain. Connect your Phantom wallet and play with SOL instantly.
          </p>
          <div style={{ marginTop: '40px' }}>
            <Link href="/lobby">
              <button className={styles.ctaButton}>Get Started</button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <Link href="/" className={styles.footerLogo}>
          <Dices size={24} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--primary)' }} />
          SOL<span style={{ color: 'var(--primary)' }}>CASINO</span>
        </Link>
        <div className={styles.footerLinks}>
          <Link href="/lobby" className={styles.footerLink}>Lobby</Link>
          <Link href="/roulette" className={styles.footerLink}>Roulette</Link>
          <Link href="/slots" className={styles.footerLink}>Slots</Link>
          <Link href="/liquidation" className={styles.footerLink}>Liquidation</Link>
        </div>
        <p className={styles.copyright}>© 2024 SOL Casino. Built on Solana & Pyth.</p>
      </footer>
    </div>
  );
}
