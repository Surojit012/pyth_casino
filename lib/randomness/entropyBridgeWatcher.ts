import { RandomnessProviderNotReadyError } from '@/lib/randomness/types';

export interface EntropyBridgeWatcherConfig {
  contractAddress: string;
  chainId: string;
}

export interface EntropyBridgeFulfillment {
  requestId: string;
  randomValue: string;
  fulfilledAt: string;
}

export class EntropyBridgeWatcher {
  constructor(private readonly config: EntropyBridgeWatcherConfig) {}

  getStatus() {
    return {
      provider: 'pyth_entropy_v2' as const,
      contractAddress: this.config.contractAddress,
      chainId: this.config.chainId,
      state: 'scaffolded' as const,
    };
  }

  async pollRequest(_requestId: string): Promise<EntropyBridgeFulfillment | null> {
    throw new RandomnessProviderNotReadyError(
      `Pyth Entropy v2 bridge watcher is scaffolded for contract ${this.config.contractAddress} on chain ${this.config.chainId}, but fulfillment polling is not wired yet.`,
      'pyth_entropy_v2'
    );
  }
}
