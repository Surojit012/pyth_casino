'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatPrice } from '@/lib/pyth';
import { formatProofShareText, getMovementPercent, type GameProof } from '@/lib/proof';
import { getRequiredClientTokenEnv } from '@/lib/solanaToken';
import styles from './ProofPanel.module.css';

interface ProofPanelProps {
  proof: GameProof | null;
  history?: GameProof[];
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getExplorerHref(signature?: string) {
  if (!signature) return null;
  const trimmed = signature.trim();
  if (trimmed.includes('(Simulated')) return null;
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return `https://sepolia.basescan.org/tx/${trimmed}`;
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(trimmed)) return null;
  return `https://explorer.solana.com/tx/${trimmed}${getRequiredClientTokenEnv().explorerClusterParam}`;
}

function getVerificationRef(signature?: string) {
  if (!signature) return null;
  const trimmed = signature.trim();
  if (!trimmed || trimmed.includes('(Simulated')) return null;
  return `${trimmed.slice(0, 10)}...`;
}

export default function ProofPanel({ proof, history = [] }: ProofPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const explorerHref = useMemo(() => getExplorerHref(proof?.signature), [proof?.signature]);
  const verificationRef = useMemo(() => getVerificationRef(proof?.signature), [proof?.signature]);

  if (!proof) return null;

  const movement = getMovementPercent(proof.startPrice, proof.endPrice);
  const movementText = `${movement >= 0 ? '+' : ''}${movement.toFixed(2)}%`;
  const isWin = proof.result === 'win';
  const summaryItems = [
    {
      key: 'result',
      label: 'Result',
      content: <strong className={isWin ? styles.up : styles.down}>{proof.result.toUpperCase()}</strong>,
    },
    verificationRef
      ? {
          key: 'reference',
          label: 'Reference',
          content: <strong>{verificationRef}</strong>,
        }
      : null,
    {
      key: 'timestamp',
      label: 'Timestamp',
      content: <strong>{formatClock(proof.timestamp)}</strong>,
    },
    explorerHref
      ? {
          key: 'explorer',
          label: 'Explorer',
          content: (
            <a href={explorerHref} target="_blank" rel="noreferrer" className={styles.explorerBtn}>
              View on Explorer <ExternalLink size={14} />
            </a>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; content: React.ReactNode }>;

  const copyProof = async () => {
    try {
      await navigator.clipboard.writeText(formatProofShareText(proof));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={`${styles.panel} ${isWin ? styles.panelWin : styles.panelLoss}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>On-chain Verified <span>✅</span></h3>
          <span className={styles.badge}>{isWin ? 'WIN' : 'LOSS'}</span>
        </div>

        <div className={styles.actions}>
          <button className={`${styles.copyBtn} micro-press`} onClick={copyProof}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            className={`${styles.toggleBtn} micro-press`}
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {showDetails ? 'Hide Details' : 'View Details'}
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        {summaryItems.map((item) => (
          <div key={item.key} className={styles.summaryItem}>
            <span>{item.label}</span>
            {item.content}
          </div>
        ))}
      </div>

      {showDetails ? (
        <div className={styles.detailWrap}>
          <div className={styles.grid}>
            <div className={styles.item}>
              <span>Asset</span>
              <strong>{proof.asset}</strong>
            </div>
            <div className={styles.item}>
              <span>Move</span>
              <strong className={movement >= 0 ? styles.up : styles.down}>{movementText}</strong>
            </div>
            <div className={styles.item}>
              <span>Start Price</span>
              <strong>${formatPrice(proof.startPrice)}</strong>
            </div>
            <div className={styles.item}>
              <span>End Price</span>
              <strong>${formatPrice(proof.endPrice)}</strong>
            </div>
            <div className={styles.item}>
              <span>Volatility</span>
              <strong>{proof.volatilityLevel}</strong>
            </div>
            <div className={styles.item}>
              <span>Source</span>
              <strong>{proof.dataSource}</strong>
            </div>
            {proof.randomnessProvider ? (
              <div className={styles.item}>
                <span>Randomness</span>
                <strong>{proof.randomnessProvider === 'local' ? 'Local Provider' : proof.randomnessProvider}</strong>
              </div>
            ) : null}
            {proof.randomnessRequestId ? (
              <div className={styles.itemWide}>
                <span>Randomness Ref</span>
                <strong className={styles.seed}>{proof.randomnessRequestId}</strong>
              </div>
            ) : null}
            {proof.randomnessSeed ? (
              <div className={styles.itemWide}>
                <span>Randomness Seed</span>
                <strong className={styles.seed}>{proof.randomnessSeed}</strong>
              </div>
            ) : null}
          </div>

          {history.length > 1 ? (
            <div className={styles.history}>
              <p className={styles.historyTitle}>Recent Verifications</p>
              <div className={styles.historyList}>
                {history.slice(0, 5).map((row) => (
                  <div key={row.id} className={styles.historyRow}>
                    <span>{formatClock(row.timestamp)}</span>
                    <span>{row.asset}</span>
                    <span className={row.result === 'win' ? styles.up : styles.down}>
                      {row.result.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
