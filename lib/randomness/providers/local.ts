import { randomBytes } from 'crypto';
import { deriveSlotsOutcomeFromSeed } from '@/lib/randomness/derive';
import type { SlotsRandomnessResolution } from '@/lib/randomness/types';

export function resolveLocalSlotsRandomness(): SlotsRandomnessResolution {
  const randomnessSeed = randomBytes(24).toString('hex');
  return {
    provider: 'local',
    requestId: `local_${Date.now()}_${randomnessSeed.slice(0, 10)}`,
    randomnessSeed,
    symbols: deriveSlotsOutcomeFromSeed(randomnessSeed),
  };
}
