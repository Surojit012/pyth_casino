'use client';

import styles from './TransactionResultCard.module.css';

export type TransactionStatus = 'success' | 'failed';

export interface TransactionResult {
  status: TransactionStatus;
  signature: string;
  direction: 'UP' | 'DOWN';
  amountSol: number;
  timestamp: string;
  errorMessage?: string;
}

interface TransactionResultCardProps {
  result: TransactionResult;
}

function shortenSignature(signature: string) {
  if (!signature) return 'N/A';
  if (signature.length < 16) return signature;
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function getExplorerLink(signature: string) {
  return `https://explorer.solana.com/tx/${signature}`;
}

export default function TransactionResultCard({ result }: TransactionResultCardProps) {
  const isSuccess = result.status === 'success';

  return (
    <section
      className={`${styles.card} ${isSuccess ? styles.success : styles.failed}`}
      aria-live="polite"
    >
      <header className={styles.header}>
        <h3>Blockchain Bet Result</h3>
        <span className={`${styles.badge} ${isSuccess ? styles.badgeSuccess : styles.badgeFailed}`}>
          {isSuccess ? 'Success' : 'Failed'}
        </span>
      </header>

      <div className={styles.grid}>
        <p><span>Tx Signature</span> {shortenSignature(result.signature)}</p>
        <p><span>Direction</span> {result.direction}</p>
        <p><span>Amount</span> {result.amountSol.toFixed(4)} SOL</p>
        <p><span>Timestamp</span> {new Date(result.timestamp).toLocaleString()}</p>
      </div>

      {result.errorMessage ? (
        <p className={styles.errorText}>{result.errorMessage}</p>
      ) : null}

      {result.signature ? (
        <a
          href={getExplorerLink(result.signature)}
          target="_blank"
          rel="noreferrer"
          className={styles.explorerBtn}
        >
          View on Explorer
        </a>
      ) : null}
    </section>
  );
}
