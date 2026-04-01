'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { useMarketData } from '@/context/MarketDataContext';
import { useSound } from '@/context/SoundContext';
import TokenWallet from '@/components/TokenWallet';
import PhantomWalletButton from '@/components/PhantomWalletButton';
import styles from './Navbar.module.css';
import {
  Home,
  Target,
  Gamepad2,
  Skull,
  Dices,
  User,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';

const NAV_LINKS = [
  { href: '/', label: 'Lobby', icon: <Home size={16} /> },
  { href: '/roulette', label: 'Roulette', icon: <Target size={16} /> },
  { href: '/slots', label: 'Slots', icon: <Gamepad2 size={16} /> },
  { href: '/liquidation', label: 'Liquidation', icon: <Skull size={16} /> },
  { href: '/profile', label: 'Profile', icon: <User size={16} /> },
];

function signedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function Navbar() {
  const pathname = usePathname();
  const { balance } = useWallet();
  const { assets, sourceLabel } = useMarketData();
  const { soundEnabled, toggleSound, unlockAudio, playCue } = useSound();
  const [showTokenWallet, setShowTokenWallet] = useState(false);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const stableSoundEnabled = isClient ? soundEnabled : false;

  const sol = assets.SOL.change15s;

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}><Dices size={18} /></span>
            <span className={styles.logoText}>SOL<span className={styles.logoAccent}>CASINO</span></span>
          </Link>
          <span className={styles.sourceBadge}>{sourceLabel}</span>
        </div>

        <div className={styles.links}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.linkActive : ''}`}
            >
              <span className={styles.linkIcon}>{link.icon}</span>
              <span className={styles.linkLabel}>{link.label}</span>
            </Link>
          ))}
        </div>

        <div className={styles.right}>
          <div className={styles.ticker}>
            <span className={styles.liveDot} />
            <span className={styles.tickerLabel}>Live</span>
            <span className={styles.tickerSep}>•</span>
            <span className={styles.tickerAsset}>SOL</span>
            <span className={sol >= 0 ? styles.tickerPositive : styles.tickerNegative}>{signedPercent(sol)}</span>
          </div>

          <button
            className={styles.soundToggle}
            onClick={() => {
              unlockAudio();
              if (stableSoundEnabled) playCue('click');
              toggleSound();
            }}
            aria-label={stableSoundEnabled ? 'Disable sound' : 'Enable sound'}
            title={stableSoundEnabled ? 'Sound On' : 'Sound Off'}
          >
            {stableSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <div className={styles.multiButtonWrap}>
            <PhantomWalletButton />
          </div>

          <div className={styles.balance}>
            <span className={styles.balanceIcon}><Wallet size={14} /></span>
            <span className={styles.balanceAmount}>
              {balance.toLocaleString('en-US', {
                minimumFractionDigits: balance < 10 ? 3 : 2,
                maximumFractionDigits: 4,
              })}
            </span>
            <span className={styles.balanceCurrency}>SOL</span>
          </div>

          <button
            className={styles.walletPanelBtn}
            onClick={() => setShowTokenWallet((prev) => !prev)}
          >
            Wallet
          </button>
        </div>
      </div>

      {showTokenWallet ? (
        <div className={styles.walletPanel}>
          <TokenWallet />
        </div>
      ) : null}
    </nav>
  );
}
