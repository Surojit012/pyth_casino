import { assertEntropyPreparationEnv, getConfiguredSlotsRandomnessProviderLabel } from '@/lib/randomness/provider';
import { RandomnessProviderNotReadyError, type SlotsRandomnessResolution } from '@/lib/randomness/types';

export function resolveEntropyV2SlotsRandomness(): SlotsRandomnessResolution {
  const env = assertEntropyPreparationEnv();

  throw new RandomnessProviderNotReadyError(
    `${getConfiguredSlotsRandomnessProviderLabel('pyth_entropy_v2')} is configured with contract ${env.contractAddress} on chain ${env.chainId}, but the bridge implementation has not been wired yet.`,
    'pyth_entropy_v2'
  );
}
