import { BN } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import { getProgram, connection, EXPLORER_CLUSTER_PARAM, RPC_ENDPOINT, RPC_NETWORK } from '@/lib/anchor';
import { getPublicEnv } from '@/lib/env/public';

export type BetDirection = 'up' | 'down';

const publicEnv = getPublicEnv();

/**
 * Vault address that receives the bet SOL.
 * Must match what the deployed program expects.
 */
const VAULT_PUBKEY = new PublicKey(
  publicEnv.NEXT_PUBLIC_VAULT_PUBKEY || '11111111111111111111111111111111'
);

/**
 * Price feed account consumed by the current on-chain program.
 * Keep this in env per deployed program requirements.
 */
const PRICE_FEED_PUBKEY = new PublicKey(
  publicEnv.NEXT_PUBLIC_PYTH_BTC_FEED_ACCOUNT || 'HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J'
);

export const ROULETTE_CONFIG = {
  rpcEndpoint: RPC_ENDPOINT,
  network: RPC_NETWORK,
  explorerClusterParam: EXPLORER_CLUSTER_PARAM,
  programId: getProgramIdString(),
  vaultPubkey: VAULT_PUBKEY.toBase58(),
  priceFeedPubkey: PRICE_FEED_PUBKEY.toBase58(),
};

function getProgramIdString() {
  return publicEnv.NEXT_PUBLIC_ROULETTE_PROGRAM_ID || '9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN';
}

export function solToLamports(amountSol: number) {
  return Math.floor(amountSol * LAMPORTS_PER_SOL);
}

/**
 * Fetch the player's SOL balance in lamports.
 * Returns 0 if the query fails.
 */
export async function getWalletSolBalance(walletPubkey: PublicKey): Promise<number> {
  try {
    return await connection.getBalance(walletPubkey, 'confirmed');
  } catch {
    return 0;
  }
}

export async function placeBetOnchain(params: {
  wallet: WalletContextState;
  amountSol: number;
  direction: BetDirection;
}) {
  const { wallet, amountSol, direction } = params;

  if (!wallet.connected || !wallet.publicKey) {
    throw new Error('Connect Phantom wallet before placing a bet.');
  }
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error('amountSol must be greater than 0.');
  }

  const amountLamports = solToLamports(amountSol);
  if (amountLamports <= 0) {
    throw new Error('Converted lamports amount must be greater than 0.');
  }

  // Pre-check: does the wallet have enough SOL (amount + ~0.01 for rent + fees)?
  const balance = await getWalletSolBalance(wallet.publicKey);
  const estimatedCost = amountLamports + 10_000_000; // bet + ~0.01 SOL buffer
  if (balance < estimatedCost) {
    throw new Error(
      `Insufficient SOL balance. Need ~${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} SOL but wallet has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
    );
  }

  try {
    const betKeypair = Keypair.generate();
    const program = getProgram(wallet);

    // Fetch blockhash BEFORE sending the transaction so confirmTransaction uses the same one.
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');

    const signature = await program.methods
      .placeBet(new BN(amountLamports), direction === 'up')
      .accounts({
        bet: betKeypair.publicKey,
        user: wallet.publicKey,
        vault: VAULT_PUBKEY,
        pythBtcPrice: PRICE_FEED_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .signers([betKeypair])
      .rpc();

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      signature,
      betPublicKey: betKeypair.publicKey.toBase58(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to place on-chain bet: ${error.message}`);
    }
    throw new Error('Failed to place on-chain bet due to an unknown error.');
  }
}
