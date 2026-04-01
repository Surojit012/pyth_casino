'use client';

import { useWallet } from '@/context/WalletContext';
import { useLiveBets } from '@/context/LiveBetsContext';
import { useMarketData, type MarketAsset } from '@/context/MarketDataContext';
import GameCard from '@/components/GameCard';
import LiveBetsFeed from '@/components/LiveBetsFeed';
import MarketPulse from '@/components/MarketPulse';
import { formatPrice, ASSET_SYMBOLS } from '@/lib/pyth';
import { SymbolIcon } from '@/components/SymbolIcon';
import { Wallet, Target, Gamepad2, Skull, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import styles from './page.module.css';

const HERO_ASSETS: MarketAsset[] = ['SOL'];

export default function Home() {
  const { balance, totalBets, totalWon, gamesPlayed, resetBalance } = useWallet();
  const { bets } = useLiveBets();
  const { assets, sourceLabel } = useMarketData();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroLine}>SOL</span>
            <span className={styles.heroLine}>CASINO</span>
          </h1>
          <p className={styles.heroTagline}>markets are the house</p>
          <p className={styles.heroSub}>
            Three games. One live market engine. Every round reacts to SOL market movement in real time.
          </p>
        </div>

        <aside className={styles.heroPanel}>
          <div className={styles.heroPanelHeader}>
            <span className={styles.liveLabel}>LIVE</span>
            <span className={styles.heroPanelSource}>SOL Mainnet Stream</span>
          </div>
          <div className={styles.heroMarketList}>
            {HERO_ASSETS.map(symbol => {
              const market = assets[symbol];
              const change = market.anchorChange;
              const directionIcon = market.anchorDirection === 'up'
                ? <ArrowUpRight size={14} />
                : market.anchorDirection === 'down'
                  ? <ArrowDownRight size={14} />
                  : <Minus size={14} />;

              return (
                <div key={symbol} className={styles.heroMarketRow}>
                  <div className={styles.heroMarketAsset}>
                    <span className={styles.heroMarketIcon}>
                      <SymbolIcon symbol={ASSET_SYMBOLS[symbol]} size={18} />
                    </span>
                    <span className={styles.heroMarketSymbol}>{symbol}</span>
                  </div>
                  <div className={styles.heroMarketData}>
                    <strong>${formatPrice(market.anchorPrice)}</strong>
                    <span className={change >= 0 ? styles.up : styles.down}>
                      {directionIcon} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </div>
                  <span className={styles.heroVolatility}>Vol: {market.volatilityLevel}</span>
                </div>
              );
            })}
          </div>
          <p className={styles.heroPanelFoot}>{sourceLabel}</p>
        </aside>
      </section>

      <section className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={20} /> {balance.toLocaleString()}
            </span>
          </span>
          <span className={styles.statLabel}>Balance</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{gamesPlayed}</span>
          <span className={styles.statLabel}>Games Played</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{totalBets.toLocaleString()}</span>
          <span className={styles.statLabel}>Total Wagered</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{totalWon.toLocaleString()}</span>
          <span className={styles.statLabel}>Total Won</span>
        </div>
      </section>

      <MarketPulse />
      {bets.length > 0 ? <LiveBetsFeed /> : null}

      <section className={styles.games}>
        <h2 className={styles.sectionTitle}>Lobby</h2>
        <div className={styles.gamesLayout}>
          <div className={styles.featuredRow}>
            <GameCard
              href="/roulette"
              icon={<Target size={32} />}
              title="Price Roulette"
              description="Take a directional bet and let the live market settle the round with live volatility-sensitive payout logic."
              tag="FEATURED"
              size="featured"
              ctaLabel="Enter"
            />
          </div>
          <div className={styles.secondaryRow}>
            <GameCard
              href="/slots"
              icon={<Gamepad2 size={30} />}
              title="Volatility Slots"
              description="Entropy-driven reels with volatility-multiplied payouts."
              ctaLabel="Play"
            />
            <GameCard
              href="/liquidation"
              icon={<Skull size={30} />}
              title="Liquidation Game"
              description="Scale leverage and survive rising danger levels."
              ctaLabel="Play"
            />
          </div>
        </div>
      </section>

      <section className={styles.powered}>
        <p className={styles.poweredText}>
          Powered by <span className={styles.poweredAccent}>Solana Mainnet</span> — live-chain gameplay and wallet-native settlement
        </p>
      </section>


    </div>
  );
}
