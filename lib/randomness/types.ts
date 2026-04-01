export type SlotsRandomnessProvider = 'local' | 'pyth_entropy_v2';

export type SlotsOutcome = [string, string, string];

export interface SlotsRandomnessResolution {
  provider: SlotsRandomnessProvider;
  requestId: string;
  randomnessSeed: string;
  symbols: SlotsOutcome;
}

export class RandomnessProviderNotReadyError extends Error {
  constructor(message: string, public provider: SlotsRandomnessProvider) {
    super(message);
    this.name = 'RandomnessProviderNotReadyError';
  }
}
