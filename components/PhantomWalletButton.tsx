'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PHANTOM_WALLET_NAME, isPhantomWalletName, shortenWalletAddress } from '@/lib/solanaWallet';
import styles from './PhantomWalletButton.module.css';

type PhantomWalletButtonProps = {
  className?: string;
};

export default function PhantomWalletButton({ className = '' }: PhantomWalletButtonProps) {
  const { connected, connecting, disconnecting, publicKey, wallet, select, connect, disconnect } =
    useWallet();
  const [pendingSelect, setPendingSelect] = useState(false);

  const walletName = wallet?.adapter.name ?? null;
  const unsupportedWallet = connected && walletName && !isPhantomWalletName(walletName);

  const runWalletAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : '';
      const lower = message.toLowerCase();
      const isExpectedDisconnect =
        name === 'WalletDisconnectedError' ||
        lower.includes('wallet disconnected') ||
        lower.includes('already disconnected') ||
        lower.includes('plugin closed');

      if (!isExpectedDisconnect) {
        console.warn('Phantom wallet action failed:', error);
      }
    } finally {
      setPendingSelect(false);
    }
  };

  useEffect(() => {
    if (!pendingSelect) return;
    if (!walletName || !isPhantomWalletName(walletName) || connected) return;

    void runWalletAction(connect);
  }, [pendingSelect, walletName, connected, connect]);

  const label = useMemo(() => {
    if (disconnecting) return 'Disconnecting...';
    if (connecting || pendingSelect) return 'Connecting...';
    if (unsupportedWallet) return 'Wrong Wallet';
    if (connected && publicKey) return shortenWalletAddress(publicKey.toBase58());
    return 'Connect Phantom';
  }, [connected, connecting, disconnecting, pendingSelect, publicKey, unsupportedWallet]);

  const handleClick = async () => {
    if (unsupportedWallet) {
      await runWalletAction(disconnect);
      return;
    }

    if (connected) {
      await runWalletAction(disconnect);
      return;
    }

    if (!walletName || !isPhantomWalletName(walletName)) {
      setPendingSelect(true);
      select(PHANTOM_WALLET_NAME);
      return;
    }

    await runWalletAction(connect);
  };

  return (
    <button
      type="button"
      className={`${styles.button} ${unsupportedWallet ? styles.danger : ''} ${className}`.trim()}
      onClick={() => void handleClick()}
      disabled={connecting || disconnecting}
      title={unsupportedWallet ? 'Disconnect unsupported wallet' : 'Phantom only'}
    >
      <span className={styles.icon}><Wallet size={14} /></span>
      <span>{label}</span>
    </button>
  );
}
