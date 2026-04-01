import { calculateSlotPayout } from '@/lib/entropy';
import { deriveSlotsOutcomeFromSeed } from '@/lib/randomness/derive';
import {
  getConfiguredSlotsRandomnessProviderLabel,
  getConfiguredSlotsRandomnessProviderServer,
} from '@/lib/randomness/provider';
import { resolveEntropyV2SlotsRandomness } from '@/lib/randomness/providers/entropy-v2';
import { resolveLocalSlotsRandomness } from '@/lib/randomness/providers/local';
import type { SlotsRandomnessProvider, SlotsRandomnessResolution } from '@/lib/randomness/types';

export interface ResolvedSlotsSpin {
  randomness: SlotsRandomnessResolution;
  providerLabel: string;
  payout: number;
  multiplier: number;
  isWin: boolean;
  matchType: string;
  volatilityMultiplier: number;
}

function resolveRandomnessForConfiguredProvider(provider: SlotsRandomnessProvider) {
  if (provider === 'pyth_entropy_v2') {
    return resolveEntropyV2SlotsRandomness();
  }

  return resolveLocalSlotsRandomness();
}

export function resolveSlotsSpin(volatilityMultiplier: number, betAmount: number): ResolvedSlotsSpin {
  const provider = getConfiguredSlotsRandomnessProviderServer();
  const randomness = resolveRandomnessForConfiguredProvider(provider);
  const payoutResult = calculateSlotPayout(randomness.symbols, betAmount, volatilityMultiplier);

  return {
    randomness,
    providerLabel: getConfiguredSlotsRandomnessProviderLabel(randomness.provider),
    payout: payoutResult.payout,
    multiplier: payoutResult.multiplier,
    isWin: payoutResult.isWin,
    matchType: payoutResult.matchType,
    volatilityMultiplier,
  };
}
