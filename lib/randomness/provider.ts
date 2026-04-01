import { RandomnessProviderNotReadyError, type SlotsRandomnessProvider } from '@/lib/randomness/types';
import { isAddress } from 'viem';
import { getPublicEnv } from '@/lib/env/public';
import { getServerEnv, isEntropyEnabledForServer } from '@/lib/env/server';

export function getConfiguredSlotsRandomnessProviderServer(): SlotsRandomnessProvider {
  if (isEntropyEnabledForServer()) return 'pyth_entropy_v2';
  return 'local';
}

export function getConfiguredSlotsRandomnessProviderClient(): SlotsRandomnessProvider {
  const configured = getPublicEnv().NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER?.trim().toLowerCase();
  if (configured === 'pyth_entropy_v2') return 'pyth_entropy_v2';
  return 'local';
}

export function getConfiguredSlotsRandomnessProviderLabel(provider: SlotsRandomnessProvider) {
  if (provider === 'pyth_entropy_v2') return 'Pyth Entropy v2';
  return 'Local Provider';
}

export function assertEntropyPreparationEnv() {
  const env = getServerEnv();
  const contractAddress = env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS?.trim();
  const chainId = env.PYTH_ENTROPY_V2_CHAIN_ID?.trim();

  if (!contractAddress || !chainId) {
    throw new RandomnessProviderNotReadyError(
      'Pyth Entropy v2 is selected for Slots, but the provider bridge is not configured yet.',
      'pyth_entropy_v2'
    );
  }

  if (!isAddress(contractAddress)) {
    throw new RandomnessProviderNotReadyError(
      'Pyth Entropy v2 contract address is invalid.',
      'pyth_entropy_v2'
    );
  }

  return {
    contractAddress,
    chainId,
  };
}
