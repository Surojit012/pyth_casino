'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { readCasinoJwt } from '@/lib/clientCasinoAuth';
import { buildDefaultDisplayName } from '@/lib/profile';
import { shortenWalletAddress } from '@/lib/solanaWallet';
import { CalendarDays, PencilLine, Save, Trophy, Wallet, TrendingUp, Activity } from 'lucide-react';
import styles from './page.module.css';

type ProfilePayload = {
  profile: {
    walletAddress: string;
    displayName: string;
    bio: string;
    balance: number;
    joinedAt: string;
    updatedAt: string;
  };
  stats: {
    totalRounds: number;
    wins: number;
    losses: number;
    winRate: number;
    totalWagered: number;
    totalPayout: number;
    grossProfit: number;
    lastRoundAt: string | null;
  };
  recentRounds: Array<{
    id: string;
    game: string;
    asset: string;
    direction?: string | null;
    betAmount: number;
    payoutAmount: number;
    result: 'win' | 'loss';
    movementPercent: number;
    volatilityLevel: string;
    proofSignature?: string | null;
    createdAt: string;
  }>;
  recentTransactions: Array<{
    type: string;
    amount: number;
    txSignature?: string | null;
    status: string;
    createdAt: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildAvatarStyle(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 72) % 360;
  return {
    background: `linear-gradient(145deg, hsl(${hueA} 78% 54%), hsl(${hueB} 70% 42%))`,
  };
}

export default function ProfilePage() {
  const { connected, publicKey } = useSolanaWallet();
  const walletAddress = publicKey?.toBase58() ?? '';
  const [profileData, setProfileData] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const loadProfile = useCallback(async () => {
    if (!walletAddress) {
      setProfileData(null);
      setError('');
      return;
    }

    const jwt = readCasinoJwt(walletAddress);
    if (!jwt) {
      setProfileData(null);
      setError('Authenticate your wallet first to load your profile.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load profile');
      }
      setProfileData(payload);
      setDisplayName(payload.profile.displayName);
      setBio(payload.profile.bio);
    } catch (nextError) {
      setProfileData(null);
      setError(nextError instanceof Error ? nextError.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = useCallback(async () => {
    if (!walletAddress) return;
    const jwt = readCasinoJwt(walletAddress);
    if (!jwt) {
      setError('Authentication expired. Re-authenticate your wallet and try again.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setStatus('');
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          displayName,
          bio,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update profile');
      }
      setProfileData((prev) => prev ? { ...prev, profile: payload.profile } : prev);
      setDisplayName(payload.profile.displayName);
      setBio(payload.profile.bio);
      setEditing(false);
      setStatus('Profile updated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [bio, displayName, walletAddress]);

  const initials = useMemo(() => {
    const source = displayName || profileData?.profile.displayName || buildDefaultDisplayName(walletAddress);
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase())
      .join('') || 'SC';
  }, [displayName, profileData?.profile.displayName, walletAddress]);

  if (!connected) {
    return (
      <div className={`game-page ${styles.page}`}>
        <section className={styles.emptyState}>
          <h1>Profile</h1>
          <p>Connect your wallet to unlock your player profile, stats, and round history.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={`game-page ${styles.page}`}>
      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <div className={styles.avatar} style={buildAvatarStyle(walletAddress)}>
            <span>{initials}</span>
          </div>
          <div className={styles.heroMeta}>
            <div className={styles.identityRow}>
              <div>
                <span className={styles.sectionLabel}>Player</span>
                <h1>{profileData?.profile.displayName || buildDefaultDisplayName(walletAddress)}</h1>
              </div>
              <button className={styles.editBtn} onClick={() => setEditing((prev) => !prev)}>
                <PencilLine size={15} /> {editing ? 'Close' : 'Edit'}
              </button>
            </div>
            <p className={styles.walletText}>{shortenWalletAddress(walletAddress)} • Wallet-native identity</p>
            <p className={styles.bio}>
              {profileData?.profile.bio || 'No bio set yet. Add a short line so your profile feels like yours.'}
            </p>
            <div className={styles.heroFacts}>
              <span><CalendarDays size={14} /> Joined {profileData ? formatDate(profileData.profile.joinedAt) : 'Loading...'}</span>
              <span><Wallet size={14} /> {profileData ? `${profileData.profile.balance.toFixed(4)} SOL` : '0.0000 SOL'}</span>
              <span><Activity size={14} /> {profileData ? `${profileData.stats.totalRounds} rounds tracked` : '0 rounds tracked'}</span>
            </div>
          </div>
        </div>

        {editing ? (
          <div className={styles.editCard}>
            <label>
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={48}
                placeholder="Enter a display name"
              />
            </label>
            <label>
              <span>Bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={180}
                rows={4}
                placeholder="Short trader bio, vibe, or strategy."
              />
            </label>
            <div className={styles.editActions}>
              <button className={styles.saveBtn} onClick={() => void saveProfile()} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving...' : 'Save profile'}
              </button>
              {status ? <span className={styles.status}>{status}</span> : null}
            </div>
          </div>
        ) : null}
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.sectionLabel}>Win Rate</span>
          <strong>{profileData ? `${profileData.stats.winRate.toFixed(1)}%` : '--'}</strong>
          <small>{profileData ? `${profileData.stats.wins} wins / ${profileData.stats.losses} losses` : 'Loading stats'}</small>
        </article>
        <article className={styles.statCard}>
          <span className={styles.sectionLabel}>Total Wagered</span>
          <strong>{profileData ? `${profileData.stats.totalWagered.toFixed(4)} SOL` : '--'}</strong>
          <small>Across all recorded rounds</small>
        </article>
        <article className={styles.statCard}>
          <span className={styles.sectionLabel}>Total Payout</span>
          <strong>{profileData ? `${profileData.stats.totalPayout.toFixed(4)} SOL` : '--'}</strong>
          <small>Gross winnings distributed</small>
        </article>
        <article className={styles.statCard}>
          <span className={styles.sectionLabel}>Net Session Edge</span>
          <strong className={profileData && profileData.stats.grossProfit >= 0 ? styles.positive : styles.negative}>
            {profileData ? `${profileData.stats.grossProfit >= 0 ? '+' : ''}${profileData.stats.grossProfit.toFixed(4)} SOL` : '--'}
          </strong>
          <small><TrendingUp size={13} /> Last round {profileData ? formatDate(profileData.stats.lastRoundAt) : 'Loading...'}</small>
        </article>
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Recent Rounds</h2>
            <span>{profileData?.recentRounds.length ?? 0} tracked</span>
          </div>
          <div className={styles.roundList}>
            {loading ? <p className={styles.helper}>Loading profile history...</p> : null}
            {!loading && profileData?.recentRounds.length === 0 ? <p className={styles.helper}>Play a round and it will appear here.</p> : null}
            {profileData?.recentRounds.map((round) => (
              <div key={round.id} className={styles.rowCard}>
                <div>
                  <strong>{round.game.toUpperCase()}</strong>
                  <span>{round.asset} • {round.volatilityLevel} vol • {formatDate(round.createdAt)}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>{round.betAmount.toFixed(4)} SOL</span>
                  <strong className={round.result === 'win' ? styles.positive : styles.negative}>
                    {round.result === 'win' ? `+${round.payoutAmount.toFixed(4)}` : `-${round.betAmount.toFixed(4)}`} SOL
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Funding Activity</h2>
            <span><Trophy size={14} /> Wallet rail</span>
          </div>
          <div className={styles.roundList}>
            {!loading && profileData?.recentTransactions.length === 0 ? <p className={styles.helper}>Deposits and withdrawals show up here.</p> : null}
            {profileData?.recentTransactions.map((tx, index) => (
              <div key={`${tx.txSignature ?? tx.createdAt}-${index}`} className={styles.rowCard}>
                <div>
                  <strong>{tx.type.replace(/_/g, ' ')}</strong>
                  <span>{formatDate(tx.createdAt)} • {tx.status}</span>
                </div>
                <div className={styles.rowMeta}>
                  <strong>{tx.amount.toFixed(4)} SOL</strong>
                  <span>{tx.txSignature ? `${tx.txSignature.slice(0, 6)}...${tx.txSignature.slice(-6)}` : 'No signature'}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

