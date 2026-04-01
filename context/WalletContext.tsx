'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { clearCasinoJwt, readCasinoJwt } from '@/lib/clientCasinoAuth';
import { getRequiredClientTokenEnv } from '@/lib/solanaToken';
import { isPhantomWalletName } from '@/lib/solanaWallet';

interface TokenTx {
  type: 'deposit' | 'withdraw';
  amount: number;
  txSignature: string;
  createdAt: string;
}

interface WalletContextType {
  balance: number;
  placeBet: (amount: number) => Promise<boolean>;
  addWinnings: (amount: number) => Promise<void>;
  resetBalance: () => void;
  totalBets: number;
  totalWon: number;
  gamesPlayed: number;
  solanaTokenBalance: number;
  tokenLoading: boolean;
  tokenError: string | null;
  tokenTransactions: TokenTx[];
  refreshSolanaTokenBalance: () => Promise<void>;
  depositToken: (amount: number) => Promise<{ txSignature: string; newBalance: number }>;
  withdrawToken: (amount: number) => Promise<{ txSignature: string; newBalance: number }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);
const MAX_SINGLE_PAYOUT = 100_000;

function normalizeWalletError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes('plugin closed') ||
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('approval denied') ||
    lower.includes('transaction cancelled') ||
    lower.includes('transaction was not confirmed')
  ) {
    return 'Transaction was cancelled in Phantom.';
  }

  if (lower.includes('wallet disconnected') || lower.includes('already disconnected')) {
    return 'Phantom disconnected. Reconnect the wallet and retry.';
  }

  if (lower.includes('cannot destructure property') || lower.includes('failed to fetch')) {
    return 'Phantom transport failed while sending the transaction. Reopen Phantom and retry.';
  }

  if (lower.includes('simulation failed') || lower.includes('transaction failed simulation')) {
    return 'Phantom rejected the transaction during simulation. Check the selected network and treasury address, then retry.';
  }

  return message;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, wallet, sendTransaction, signTransaction } = useSolanaWallet();
  const { connection } = useConnection();

  const walletAddress = publicKey?.toBase58() ?? '';
  const walletName = wallet?.adapter.name ?? '';
  const unsupportedWallet = connected && walletName && !isPhantomWalletName(walletName);

  const [solanaTokenBalance, setSolanaTokenBalance] = useState(0);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenTransactions, setTokenTransactions] = useState<TokenTx[]>([]);
  const [sessionStats, setSessionStats] = useState({
    totalBets: 0,
    totalWon: 0,
    gamesPlayed: 0,
  });

  const appendTokenTransaction = useCallback((nextTx: TokenTx) => {
    setTokenTransactions((prev) => [nextTx, ...prev].slice(0, 10));
  }, []);

  const refreshSolanaTokenBalance = useCallback(async () => {
    const jwt = readCasinoJwt(walletAddress || undefined);
    if (!jwt || !walletAddress || unsupportedWallet) {
      setSolanaTokenBalance(0);
      return;
    }

    try {
      setTokenLoading(true);
      setTokenError(null);
      const response = await fetch('/api/balance', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          clearCasinoJwt();
          setSolanaTokenBalance(0);
        }
        throw new Error(payload?.error ?? 'Failed to fetch wallet balance');
      }
      setSolanaTokenBalance(Number(payload.balance ?? 0));
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : 'Failed to fetch wallet balance');
    } finally {
      setTokenLoading(false);
    }
  }, [walletAddress, unsupportedWallet]);

  useEffect(() => {
    if (!connected || !publicKey || unsupportedWallet) {
      setSolanaTokenBalance(0);
      return;
    }
    void refreshSolanaTokenBalance();
  }, [connected, publicKey, unsupportedWallet, refreshSolanaTokenBalance]);

  const placeBet = useCallback(async (amount: number): Promise<boolean> => {
    if (!connected || !publicKey) return false;
    if (!Number.isFinite(amount) || amount <= 0 || amount > solanaTokenBalance) return false;

    const jwt = readCasinoJwt(walletAddress || undefined);
    if (!jwt) return false;

    setSolanaTokenBalance((prev) => prev - amount);

    try {
      const res = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ amount, game: 'slots' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSolanaTokenBalance((prev) => prev + amount);
        console.error('Failed to place bet (server):', data.error);
        return false;
      }
      setSolanaTokenBalance(data.newBalance);
      setSessionStats((prev) => ({
        ...prev,
        totalBets: prev.totalBets + amount,
        gamesPlayed: prev.gamesPlayed + 1,
      }));
      return true;
    } catch (error) {
      console.error('Failed to place bet (network):', error);
      setSolanaTokenBalance((prev) => prev + amount);
      return false;
    }
  }, [connected, publicKey, solanaTokenBalance, walletAddress]);

  const addWinnings = useCallback(async (amount: number): Promise<void> => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const capped = Math.min(amount, MAX_SINGLE_PAYOUT);

    const jwt = readCasinoJwt(walletAddress || undefined);
    if (!jwt) return;

    setSolanaTokenBalance((prev) => prev + capped);

    try {
      const res = await fetch('/api/win', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ amount: capped, game: 'slots' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSolanaTokenBalance(data.newBalance);
        setSessionStats((prev) => ({
          ...prev,
          totalWon: prev.totalWon + capped,
        }));
      } else {
        setSolanaTokenBalance((prev) => Math.max(0, prev - capped));
        console.error('Failed to add winnings (server):', data.error);
      }
    } catch (error) {
      console.error('Failed to add winnings (network):', error);
      setSolanaTokenBalance((prev) => Math.max(0, prev - capped));
    }
  }, [walletAddress]);

  const resetBalance = useCallback(() => {
    // Deprecated for on-chain architecture.
  }, []);

  const sendWithFallback = useCallback(async (transaction: Transaction) => {
    if (!publicKey || !sendTransaction) {
      throw new Error('Connect Phantom before sending transactions.');
    }

    const latest = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latest.blockhash;
    transaction.feePayer = publicKey;

    try {
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    } catch (error) {
      const normalized = normalizeWalletError(error);
      const isTransportFailure =
        normalized.toLowerCase().includes('phantom transport failed') ||
        normalized.toLowerCase().includes('failed to fetch');

      if (!isTransportFailure) {
        throw new Error(normalized);
      }
      if (!signTransaction) {
        throw new Error('Phantom transport failed and signTransaction fallback is unavailable.');
      }

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    }
  }, [connection, publicKey, sendTransaction, signTransaction]);

  const depositToken = useCallback(async (amount: number) => {
    if (!connected || !publicKey || !sendTransaction) {
      throw new Error('Connect Phantom first.');
    }
    if (unsupportedWallet) {
      throw new Error('SOL deposits currently support Phantom only.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Deposit amount must be greater than 0.');
    }

    const jwt = readCasinoJwt(walletAddress || undefined);
    if (!jwt) {
      throw new Error('Missing casino_jwt. Please authenticate this wallet first.');
    }

    setTokenLoading(true);
    setTokenError(null);
    try {
      const { treasuryWallet } = getRequiredClientTokenEnv();
      const treasuryPubkey = new PublicKey(treasuryWallet);
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);
      if (lamports <= 0) {
        throw new Error('Deposit amount is too small.');
      }

      const solBalance = await connection.getBalance(publicKey, 'confirmed');
      const estimatedFeeBuffer = 0.00002 * LAMPORTS_PER_SOL;
      if (solBalance < lamports + estimatedFeeBuffer) {
        throw new Error(
          `Insufficient SOL in Phantom. Available: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL.`
        );
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports,
        })
      );

      const txSignature = await sendWithFallback(transaction);
      const response = await fetch('/api/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ txSignature }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const details = payload?.details ? ` (${payload.details})` : '';
        throw new Error(`${payload?.error ?? 'Deposit verification failed'}${details}`);
      }

      const newBalance = Number(payload.newBalance ?? 0);
      setSolanaTokenBalance(newBalance);
      appendTokenTransaction({
        type: 'deposit',
        amount,
        txSignature,
        createdAt: new Date().toISOString(),
      });

      return { txSignature, newBalance };
    } catch (error) {
      const message = normalizeWalletError(error);
      setTokenError(message);
      throw new Error(message);
    } finally {
      setTokenLoading(false);
    }
  }, [
    appendTokenTransaction,
    connected,
    connection,
    publicKey,
    sendTransaction,
    sendWithFallback,
    unsupportedWallet,
    walletAddress,
  ]);

  const withdrawToken = useCallback(async (amount: number) => {
    if (!connected || !publicKey) {
      throw new Error('Connect Phantom first.');
    }
    if (unsupportedWallet) {
      throw new Error('SOL withdrawals currently support Phantom only.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Withdraw amount must be greater than 0.');
    }

    const jwt = readCasinoJwt(walletAddress || undefined);
    if (!jwt) {
      throw new Error('Missing casino_jwt. Please authenticate this wallet first.');
    }

    setTokenLoading(true);
    setTokenError(null);
    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ amount }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const details = payload?.details ? ` (${payload.details})` : '';
        throw new Error(`${payload?.error ?? 'Withdraw failed'}${details}`);
      }

      const txSignature = String(payload.txSignature ?? '');
      const newBalance = Number(payload.newBalance ?? 0);
      setSolanaTokenBalance(newBalance);
      appendTokenTransaction({
        type: 'withdraw',
        amount,
        txSignature,
        createdAt: new Date().toISOString(),
      });

      return { txSignature, newBalance };
    } catch (error) {
      const message = normalizeWalletError(error);
      setTokenError(message);
      throw new Error(message);
    } finally {
      setTokenLoading(false);
    }
  }, [appendTokenTransaction, connected, publicKey, unsupportedWallet, walletAddress]);

  return (
    <WalletContext.Provider
      value={{
        balance: solanaTokenBalance,
        placeBet,
        addWinnings,
        resetBalance,
        totalBets: sessionStats.totalBets,
        totalWon: sessionStats.totalWon,
        gamesPlayed: sessionStats.gamesPlayed,
        solanaTokenBalance,
        tokenLoading,
        tokenError,
        tokenTransactions,
        refreshSolanaTokenBalance,
        depositToken,
        withdrawToken,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
