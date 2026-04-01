import { SLOT_SYMBOLS, SYMBOL_WEIGHTS } from '@/lib/entropy';
import type { SlotsOutcome } from '@/lib/randomness/types';

function pickWeightedSymbol(source: number) {
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let cursor = (source % totalWeight) + 1;

  for (const symbol of SLOT_SYMBOLS) {
    cursor -= SYMBOL_WEIGHTS[symbol] ?? 0;
    if (cursor <= 0) return symbol;
  }

  return SLOT_SYMBOLS[0] ?? 'slot';
}

export function deriveSlotsOutcomeFromSeed(seed: string): SlotsOutcome {
  const symbols: string[] = [];

  for (let index = 0; index < 3; index += 1) {
    const slice = seed.slice(index * 8, index * 8 + 8);
    const value = Number.parseInt(slice || '0', 16);
    symbols.push(pickWeightedSymbol(value));
  }

  return symbols as SlotsOutcome;
}
