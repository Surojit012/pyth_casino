'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, X } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import {
  clearCasinoJwt,
  hasCasinoJwt,
  persistCasinoJwt,
  readCasinoJwtWallet,
} from '@/lib/clientCasinoAuth';
import { getRequiredClientTokenEnv } from '@/lib/solanaToken';
import { isPhantomWalletName, shortenWalletAddress } from '@/lib/solanaWallet';
import PhantomWalletButton from '@/components/PhantomWalletButton';
import styles from './TokenWallet.module.css';

type WalletAction = 'deposit' | 'withdraw' | null;
type CompletedTransfer = {
  type: 'deposit' | 'withdraw';
  amount: number;
  txSignature: string;
};

function explorerTx(signature: string) {
  const { explorerClusterParam } = getRequiredClientTokenEnv();
  return `https://explorer.solana.com/tx/${signature}${explorerClusterParam}`;
}

function shortenSignature(signature: string) {
  if (!signature) return 'pending';
  if (signature.length <= 14) return signature;
  return `${signature.slice(0, 6)}...${signature.slice(-6)}`;
}

function normalizeSignature(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);

  if (Array.isArray(raw)) {
    return new Uint8Array(raw.map((value) => Number(value)));
  }

  if (raw && typeof raw === 'object') {
    const candidate = raw as { signature?: unknown; data?: unknown };
    if (candidate.signature !== undefined) return normalizeSignature(candidate.signature);
    if (candidate.data !== undefined) return normalizeSignature(candidate.data);
  }

  throw new Error('Phantom did not return a valid message signature.');
}

function normalizeAuthError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes('approval denied') ||
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('plugin closed')
  ) {
    return 'Signature approval was denied in Phantom.';
  }
  if (lower.includes('unsupported') || lower.includes('empty signature')) {
    return 'Phantom did not return a usable signature. Retry authentication.';
  }
  return message;
}

export default function TokenWallet() {
  const { connected, publicKey, signMessage, wallet } = useSolanaWallet();
  const {
    solanaTokenBalance,
    tokenLoading,
    tokenError,
    tokenTransactions,
    refreshSolanaTokenBalance,
    depositToken,
    withdrawToken,
  } = useWallet();

  const [depositAmount, setDepositAmount] = useState('0.01');
  const [withdrawAmount, setWithdrawAmount] = useState('0.01');
  const [status, setStatus] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeAction, setActiveAction] = useState<WalletAction>(null);
  const [mounted, setMounted] = useState(false);
  const [lastCompletedTransfer, setLastCompletedTransfer] = useState<CompletedTransfer | null>(null);
  const authInFlightRef = useRef(false);

  const walletAddress = useMemo(() => publicKey?.toBase58() ?? '', [publicKey]);
  const walletName = wallet?.adapter.name ?? '';
  const unsupportedWallet = connected && walletName && !isPhantomWalletName(walletName);
  const { networkLabel } = getRequiredClientTokenEnv();
  const visibleError = tokenError || '';
  const visibleStatus = status && status !== tokenError ? status : '';

  const authenticateWallet = async (): Promise<boolean> => {
    if (!connected || !walletAddress) {
      setStatus('Connect Phantom before authenticating.');
      return false;
    }
    if (unsupportedWallet) {
      setStatus('Wallet actions currently support Phantom only.');
      return false;
    }
    if (!signMessage) {
      setStatus('This Phantom session does not support message signing.');
      return false;
    }
    if (authInFlightRef.current) return false;

    authInFlightRef.current = true;
    try {
      const nonceResponse = await fetch(`/api/auth/nonce?wallet=${walletAddress}`);
      const noncePayload = await nonceResponse.json();
      if (!nonceResponse.ok || !noncePayload?.nonce) {
        throw new Error(noncePayload?.error ?? 'Failed to fetch auth nonce');
      }

      const messageBytes = new TextEncoder().encode(noncePayload.nonce);
      const rawSignature = await signMessage(messageBytes);
      const signatureBytes = normalizeSignature(rawSignature);
      if (signatureBytes.length !== 64) {
        throw new Error('Phantom returned an invalid signature payload.');
      }

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          signature: Array.from(signatureBytes),
          nonce: noncePayload.nonce,
        }),
      });
      const loginPayload = await loginResponse.json();
      if (!loginResponse.ok || !loginPayload?.token) {
        throw new Error(loginPayload?.error ?? 'Wallet login failed');
      }

      persistCasinoJwt(loginPayload.token, walletAddress);
      setIsAuthenticated(true);
      setStatus('Wallet ready for deposits and withdrawals.');
      await refreshSolanaTokenBalance();
      return true;
    } catch (error) {
      setIsAuthenticated(false);
      const message = error instanceof Error ? error.message : 'Wallet auth failed';
      setStatus(normalizeAuthError(message));
      return false;
    } finally {
      authInFlightRef.current = false;
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!connected || !walletAddress) {
      clearCasinoJwt();
      setIsAuthenticated(false);
      setStatus('');
      return;
    }

    const storedWallet = readCasinoJwtWallet();
    if (storedWallet && storedWallet !== walletAddress) {
      clearCasinoJwt();
    }

    const authed = hasCasinoJwt(walletAddress);
    setIsAuthenticated(authed);

    if (unsupportedWallet) {
      setStatus('Unsupported wallet detected. Disconnect it and use Phantom.');
      return;
    }

    if (authed) {
      setStatus('');
      void refreshSolanaTokenBalance();
      return;
    }

    setStatus('Authenticate this Phantom wallet to move funds.');
  }, [connected, walletAddress, unsupportedWallet, refreshSolanaTokenBalance]);

  const ensureAuth = async () => {
    if (!hasCasinoJwt(walletAddress)) {
      const ok = await authenticateWallet();
      if (!ok) throw new Error('Wallet authentication is required first.');
    }
  };

  const onDeposit = async () => {
    const amount = Number(depositAmount);
    try {
      if (unsupportedWallet) throw new Error('Wallet actions currently support Phantom only.');
      await ensureAuth();
      setStatus('Waiting for Phantom approval...');
      const result = await depositToken(amount);
      setStatus(`Deposit confirmed (${shortenSignature(result.txSignature)}).`);
      setLastCompletedTransfer({
        type: 'deposit',
        amount,
        txSignature: result.txSignature,
      });
      setDepositAmount('0.01');
      setActiveAction(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deposit failed');
    }
  };

  const onWithdraw = async () => {
    const amount = Number(withdrawAmount);
    try {
      if (unsupportedWallet) throw new Error('Wallet actions currently support Phantom only.');
      await ensureAuth();
      setStatus('Sending payout from casino treasury to your Phantom wallet...');
      const result = await withdrawToken(amount);
      setStatus(`Treasury payout confirmed (${shortenSignature(result.txSignature)}).`);
      setLastCompletedTransfer({
        type: 'withdraw',
        amount,
        txSignature: result.txSignature,
      });
      setWithdrawAmount('0.01');
      setActiveAction(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Withdraw failed');
    }
  };

  return (
    <>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <h3>Wallet</h3>
            <p>{networkLabel}</p>
          </div>
          <PhantomWalletButton />
        </div>

        <div className={styles.summary}>
          <div className={styles.summaryBlock}>
            <span>Address</span>
            <strong>{walletAddress ? shortenWalletAddress(walletAddress) : 'Not connected'}</strong>
          </div>
          <div className={styles.summaryBlock}>
            <span>Balance</span>
            <strong>{solanaTokenBalance.toFixed(6)} SOL</strong>
          </div>
        </div>

        <div className={styles.inlineMeta}>
          <span className={isAuthenticated ? styles.ready : styles.pending}>
            {connected && isAuthenticated ? <CheckCircle2 size={14} /> : null}
            {connected && isAuthenticated ? 'Ready' : 'Needs signature'}
          </span>
          <span>{walletName || 'Phantom'}</span>
        </div>

        <div className={styles.actionRow}>
          <button
            className={`${styles.actionBtn} micro-press`}
            onClick={() => setActiveAction('deposit')}
            disabled={!connected || unsupportedWallet || tokenLoading}
          >
            <ArrowDownLeft size={16} /> Deposit
          </button>
          <button
            className={`${styles.actionBtn} micro-press`}
            onClick={() => setActiveAction('withdraw')}
            disabled={!connected || unsupportedWallet || tokenLoading}
          >
            <ArrowUpRight size={16} /> Withdraw
          </button>
        </div>

        {visibleError ? <p className={styles.error}>{visibleError}</p> : null}
        {visibleStatus ? <p className={styles.status}>{visibleStatus}</p> : null}
        {lastCompletedTransfer ? (
          <div className={styles.transferCard}>
            <div>
              <span>{lastCompletedTransfer.type === 'deposit' ? 'Last deposit' : 'Last withdrawal'}</span>
              <strong>
                {lastCompletedTransfer.type === 'deposit'
                  ? `+${lastCompletedTransfer.amount.toFixed(3)} SOL`
                  : `-${lastCompletedTransfer.amount.toFixed(3)} SOL`}
              </strong>
            </div>
            <a href={explorerTx(lastCompletedTransfer.txSignature)} target="_blank" rel="noreferrer">
              View on Explorer
            </a>
          </div>
        ) : null}

        <div className={styles.section}>
          <h4>Recent</h4>
          <ul className={styles.txList}>
            {tokenTransactions.map((tx) => (
              <li key={`${tx.txSignature}-${tx.createdAt}`}>
                <div>
                  <strong>{tx.type === 'deposit' ? 'Deposit' : 'Withdraw'}</strong>
                  <span>{tx.amount} SOL</span>
                </div>
                <a href={explorerTx(tx.txSignature)} target="_blank" rel="noreferrer">
                  View
                </a>
              </li>
            ))}
            {tokenTransactions.length === 0 ? <li className={styles.empty}>No transactions yet</li> : null}
          </ul>
        </div>
      </div>

      {mounted && activeAction
        ? createPortal(
            <div className={styles.modalBackdrop} onClick={() => setActiveAction(null)}>
              <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
                <button className={styles.closeBtn} onClick={() => setActiveAction(null)} aria-label="Close">
                  <X size={16} />
                </button>
                <h4>{activeAction === 'deposit' ? 'Deposit SOL' : 'Withdraw SOL'}</h4>
                <p>
                  {activeAction === 'deposit'
                    ? 'Move funds from Phantom into your casino balance.'
                    : 'Withdrawals are sent by the casino treasury to your connected Phantom wallet.'}
                </p>
                {activeAction === 'withdraw' ? (
                  <div className={styles.infoCard}>
                    <strong>No Phantom popup during payout</strong>
                    <span>
                      Your wallet already authenticated this session. The treasury signs and sends the SOL payout on
                      the backend, then we return the transaction signature here.
                    </span>
                  </div>
                ) : null}
                <label htmlFor={`${activeAction}-amount`}>Amount</label>
                <input
                  id={`${activeAction}-amount`}
                  type="number"
                  min="0"
                  step="0.001"
                  value={activeAction === 'deposit' ? depositAmount : withdrawAmount}
                  onChange={(event) =>
                    activeAction === 'deposit'
                      ? setDepositAmount(event.target.value)
                      : setWithdrawAmount(event.target.value)
                  }
                />
                <div className={styles.modalActions}>
                  <button className={styles.secondaryBtn} onClick={() => setActiveAction(null)}>
                    Cancel
                  </button>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => void (activeAction === 'deposit' ? onDeposit() : onWithdraw())}
                  >
                    {activeAction === 'deposit' ? 'Confirm Deposit' : 'Send Treasury Payout'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
