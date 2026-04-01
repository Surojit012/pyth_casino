import { RandomnessProviderNotReadyError, type SlotsRandomnessProvider } from '@/lib/randomness/types';

export function getConfiguredSlotsRandomnessProviderServer(): SlotsRandomnessProvider {
  const configured = process.env.SLOTS_RANDOMNESS_PROVIDER?.trim().toLowerCase();
  if (configured === 'pyth_entropy_v2') return 'pyth_entropy_v2';
  return 'local';
}

export function getConfiguredSlotsRandomnessProviderClient(): SlotsRandomnessProvider {
  const configured = process.env.NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER?.trim().toLowerCase();
  if (configured === 'pyth_entropy_v2') return 'pyth_entropy_v2';
  return 'local';
}

export function getConfiguredSlotsRandomnessProviderLabel(provider: SlotsRandomnessProvider) {
  if (provider === 'pyth_entropy_v2') return 'Pyth Entropy v2';
  return 'Local Provider';
}

export function assertEntropyPreparationEnv() {
  const contractAddress = process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS?.trim();
  const chainId = process.env.PYTH_ENTROPY_V2_CHAIN_ID?.trim();

  if (!contractAddress || !chainId) {
    throw new RandomnessProviderNotReadyError(
      'Pyth Entropy v2 is selected for Slots, but the provider bridge is not configured yet.',
      'pyth_entropy_v2'
    );
  }

  return {
    contractAddress,
    chainId,
  };
}
