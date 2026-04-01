// Simulated entropy engine
// Uses crypto.getRandomValues for quality randomness in MVP

export function getRandomNumber(min: number, max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const normalized = array[0] / (0xFFFFFFFF + 1);
  return Math.floor(normalized * (max - min + 1)) + min;
}

export function getRandomFloat(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / (0xFFFFFFFF + 1);
}

// Slot symbols and their weights
export const SLOT_SYMBOLS = ['btc', 'eth', 'sol', 'diamond', 'rocket', 'fire', 'lightning', 'slot'];

export const SYMBOL_WEIGHTS: Record<string, number> = {
  'btc': 5,   // Bitcoin - rare
  'eth': 8,   // Ethereum
  'sol': 10,  // Solana
  'diamond': 12,  // Diamond
  'rocket': 15,  // Rocket
  'fire': 18,  // Fire
  'lightning': 20,  // Lightning - common
  'slot': 12,  // Slots
};

// Payout multipliers for matches
export const PAYOUT_TABLE: Record<string, number> = {
  'btc-btc-btc': 50,     // Jackpot!
  'eth-eth-eth': 25,
  'sol-sol-sol': 15,
  'diamond-diamond-diamond': 10,
  'rocket-rocket-rocket': 8,
  'fire-fire-fire': 5,
  'lightning-lightning-lightning': 3,
  'slot-slot-slot': 20,
  'pair': 1.5,     // 2 of a kind
};

export function getSlotOutcome(): [string, string, string] {
  return [getWeightedSymbol(), getWeightedSymbol(), getWeightedSymbol()];
}

function getWeightedSymbol(): string {
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
  let random = getRandomNumber(1, totalWeight);

  for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
    random -= weight;
    if (random <= 0) return symbol;
  }

  return SLOT_SYMBOLS[0];
}

export function calculateSlotPayout(
  symbols: [string, string, string],
  betAmount: number,
  volatilityMultiplier: number = 1
): { payout: number; multiplier: number; isWin: boolean; matchType: string } {
  const [a, b, c] = symbols;

  // Three of a kind
  if (a === b && b === c) {
    const key = `${a}-${b}-${c}`;
    const baseMultiplier = PAYOUT_TABLE[key] || 5;
    const finalMultiplier = baseMultiplier * volatilityMultiplier;
    return {
      payout: betAmount * finalMultiplier,
      multiplier: finalMultiplier,
      isWin: true,
      matchType: 'triple',
    };
  }

  // Two of a kind
  if (a === b || b === c || a === c) {
    const baseMultiplier = PAYOUT_TABLE['pair'] || 1.5;
    const finalMultiplier = baseMultiplier * volatilityMultiplier;
    return {
      payout: betAmount * finalMultiplier,
      multiplier: finalMultiplier,
      isWin: true,
      matchType: 'pair',
    };
  }

  return {
    payout: 0,
    multiplier: 0,
    isWin: false,
    matchType: 'none',
  };
}

// Calculate volatility multiplier based on price movement
export function getVolatilityMultiplier(priceChange: number): number {
  const absChange = Math.abs(priceChange);
  if (absChange > 5) return 2.5;
  if (absChange > 3) return 2.0;
  if (absChange > 1) return 1.5;
  if (absChange > 0.5) return 1.2;
  return 1.0;
}
