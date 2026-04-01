import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { getPublicEnv } from '@/lib/env/public';
import rouletteIdl from '@/lib/idl/pyth_roulette.json';
import { getExplorerClusterParam, getRpcNetworkLabel } from '@/lib/solanaToken';

const publicEnv = getPublicEnv();

export const RPC_ENDPOINT = publicEnv.NEXT_PUBLIC_SOLANA_RPC_URL;
export const RPC_NETWORK = getRpcNetworkLabel(RPC_ENDPOINT);
export const EXPLORER_CLUSTER_PARAM = getExplorerClusterParam(RPC_ENDPOINT);

export const PROGRAM_ID = new PublicKey(
  publicEnv.NEXT_PUBLIC_ROULETTE_PROGRAM_ID || '9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN'
);

/** Single shared connection — reused by both anchor.ts and onchainRoulette.ts */
export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

type SignableTransaction = Transaction | VersionedTransaction;

interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction: <T extends SignableTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends SignableTransaction>(txs: T[]) => Promise<T[]>;
}

function toAnchorWallet(wallet: WalletContextState): AnchorWalletLike {
  if (!wallet.publicKey) {
    throw new Error('wallet.publicKey is required before creating Anchor provider');
  }
  if (!wallet.signTransaction) {
    throw new Error('Wallet does not support signTransaction');
  }

  return {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions:
      wallet.signAllTransactions ??
      (async <T extends SignableTransaction>(transactions: T[]) =>
        Promise.all(transactions.map((tx) => wallet.signTransaction!(tx)))),
  };
}

export function getProgram(wallet: WalletContextState) {
  const provider = new AnchorProvider(connection, toAnchorWallet(wallet), {
    commitment: 'confirmed',
  });

  return new Program(rouletteIdl as Idl, provider);
}
