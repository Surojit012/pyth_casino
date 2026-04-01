export type VolatilityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type MarketMood = 'Market Calm' | 'Market Volatile' | 'Market Insane';
export type DangerLevel = 'SAFE' | 'WATCH' | 'DANGER' | 'CRITICAL';

export const VOLATILITY_WINDOW = 40;
export const PRICE_LOOKBACK_TICKS = 60; // 15s lookback at 250ms stream cadence

export function calculateRollingVolatility(prices: number[], window: number = VOLATILITY_WINDOW): number {
  if (prices.length < 2) return 0;

  const start = Math.max(1, prices.length - window);
  let sumSquaredReturns = 0;
  let count = 0;

  for (let i = start; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const next = prices[i];
    if (prev <= 0 || next <= 0) continue;

    const logReturn = Math.log(next / prev);
    sumSquaredReturns += logReturn * logReturn;
    count += 1;
  }

  if (count === 0) return 0;

  // Scaled RMS of log-returns, represented as percent.
  const rms = Math.sqrt(sumSquaredReturns / count);
  const scaled = rms * Math.sqrt(Math.min(window, count)) * 100;
  return Number(scaled.toFixed(3));
}

export function classifyVolatility(volatility: number): VolatilityLevel {
  if (volatility < 0.18) return 'LOW';
  if (volatility < 0.45) return 'MEDIUM';
  return 'HIGH';
}

export function getMarketMood(changePercent: number): MarketMood {
  const absChange = Math.abs(changePercent);
  if (absChange < 0.35) return 'Market Calm';
  if (absChange < 1.2) return 'Market Volatile';
  return 'Market Insane';
}

export function getSlotsVolatilityMultiplier(level: VolatilityLevel): number {
  if (level === 'HIGH') return 1.85;
  if (level === 'MEDIUM') return 1.35;
  return 1.0;
}

export function getRoulettePayoutMultiplier(level: VolatilityLevel, basePayout: number = 1.9): number {
  if (level === 'HIGH') return Number((basePayout + 0.45).toFixed(2));
  if (level === 'MEDIUM') return Number((basePayout + 0.2).toFixed(2));
  return basePayout;
}

export function getLiquidationDifficultyScalar(level: VolatilityLevel): number {
  if (level === 'HIGH') return 1.8;
  if (level === 'MEDIUM') return 1.35;
  return 1.0;
}

export function getDangerLevel(volatility: number): DangerLevel {
  if (volatility < 0.12) return 'SAFE';
  if (volatility < 0.25) return 'WATCH';
  if (volatility < 0.45) return 'DANGER';
  return 'CRITICAL';
}
