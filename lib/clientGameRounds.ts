'use client';

import { readCasinoJwt } from '@/lib/clientCasinoAuth';

type PersistedGame = 'roulette' | 'slots' | 'liquidation';
type PersistedResult = 'win' | 'loss';

export interface PersistGameRoundInput {
  game: PersistedGame;
  asset: string;
  direction?: string;
  betAmount: number;
  payoutAmount: number;
  result: PersistedResult;
  startPrice: number;
  endPrice: number;
  movementPercent: number;
  volatilityLevel: string;
  dataSource?: string;
  proofSignature?: string;
  metadata?: Record<string, unknown>;
}

export async function persistGameRound(
  input: PersistGameRoundInput,
  walletAddress?: string
) {
  const jwt = readCasinoJwt(walletAddress);
  if (!jwt) return false;

  try {
    const response = await fetch('/api/rounds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(input),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to persist game round', error);
    return false;
  }
}
