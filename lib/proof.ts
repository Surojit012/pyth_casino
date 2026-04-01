import type { MarketAsset } from '@/context/MarketDataContext';
import type { VolatilityLevel } from '@/lib/volatility';

export type ProofGame = 'slots' | 'roulette' | 'liquidation';
export type ProofResult = 'win' | 'loss';

export interface GameProof {
  id: string;
  game: ProofGame;
  asset: MarketAsset;
  startPrice: number;
  endPrice: number;
  timestamp: number;
  volatilityLevel: VolatilityLevel;
  result: ProofResult;
  randomnessSeed?: string;
  randomnessProvider?: string;
  randomnessRequestId?: string;
  dataSource: string;
  signature?: string;
}

export interface NewProofInput {
  game: ProofGame;
  asset: MarketAsset;
  startPrice: number;
  endPrice: number;
  timestamp?: number;
  volatilityLevel: VolatilityLevel;
  result: ProofResult;
  randomnessSeed?: string;
  randomnessProvider?: string;
  randomnessRequestId?: string;
  dataSource?: string;
  signature?: string;
}

export function getMovementPercent(startPrice: number, endPrice: number): number {
  if (!Number.isFinite(startPrice) || startPrice === 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

export function createProofId() {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return `proof_${Date.now()}_${array[0].toString(16)}`;
}

export function createRandomnessSeed() {
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, dec => dec.toString(16).padStart(8, '0')).join('');
}

export function generateMockSignature(proof: Omit<GameProof, 'signature'>): string {
  // Simulates an on-chain verification signature
  const rawData = `${proof.game}:${proof.asset}:${proof.startPrice}:${proof.endPrice}:${proof.result}:${proof.randomnessSeed || 'noseed'}`;
  let hash = 0;
  for (let i = 0; i < rawData.length; i++) {
    const char = rawData.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(16, '0')} (Simulated Verifiable Signature)`;
}

export function formatProofShareText(proof: GameProof): string {
  const movement = getMovementPercent(proof.startPrice, proof.endPrice);
  const movementText = `${movement >= 0 ? '+' : ''}${movement.toFixed(2)}%`;
  const ts = new Date(proof.timestamp).toISOString();
  const lines = [
    `Verified on Solana | ${proof.game.toUpperCase()} ${proof.result.toUpperCase()}`,
    `${proof.asset} moved ${movementText}`,
    `Start: ${proof.startPrice.toFixed(2)} | End: ${proof.endPrice.toFixed(2)}`,
    `Volatility: ${proof.volatilityLevel} | Source: ${proof.dataSource}`,
    proof.randomnessSeed ? `Seed: ${proof.randomnessSeed}` : null,
    proof.randomnessProvider ? `Randomness: ${proof.randomnessProvider}` : null,
    proof.randomnessRequestId ? `Randomness Ref: ${proof.randomnessRequestId}` : null,
    proof.signature ? `Signature: ${proof.signature}` : null,
    `Timestamp: ${ts}`,
    '#Solana #Mainnet #SolCasino',
  ].filter(Boolean);

  return lines.join('\n');
}
