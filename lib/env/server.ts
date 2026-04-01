import { z } from 'zod';
import { getPublicEnv } from '@/lib/env/public';

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  JWT_SECRET: z.string().trim().min(16),
  TREASURY_PRIVATE_KEY: z.string().trim().optional(),
  PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY: z.string().trim().optional(),
  PYTH_ENTROPY_V2_BRIDGE_SECRET: z.string().trim().optional(),
  PYTH_ENTROPY_V2_CONTRACT_ADDRESS: z.string().trim().optional(),
  PYTH_ENTROPY_V2_CHAIN_ID: z.string().trim().optional(),
  PYTH_ENTROPY_V2_RPC_URL: z.string().trim().url().optional(),
  PYTH_ENTROPY_V2_ENTROPY_ADDRESS: z.string().trim().optional(),
  PYTH_ENTROPY_V2_DEFAULT_PROVIDER: z.string().trim().optional(),
  PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT: z.string().trim().optional(),
  PYTH_CASINO_APP_URL: z.string().trim().url().optional(),
  SLOTS_RANDOMNESS_PROVIDER: z.enum(['local', 'pyth_entropy_v2']).default('local'),
  ENABLE_ENTROPY_SLOTS: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === 'true'),
});

let cachedServerEnv: (z.infer<typeof serverEnvSchema> & { publicEnv: ReturnType<typeof getPublicEnv> }) | null = null;

export function getServerEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  cachedServerEnv = {
    ...serverEnvSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY,
      PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY: process.env.PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY,
      PYTH_ENTROPY_V2_BRIDGE_SECRET: process.env.PYTH_ENTROPY_V2_BRIDGE_SECRET,
      PYTH_ENTROPY_V2_CONTRACT_ADDRESS: process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS,
      PYTH_ENTROPY_V2_CHAIN_ID: process.env.PYTH_ENTROPY_V2_CHAIN_ID,
      PYTH_ENTROPY_V2_RPC_URL: process.env.PYTH_ENTROPY_V2_RPC_URL,
      PYTH_ENTROPY_V2_ENTROPY_ADDRESS: process.env.PYTH_ENTROPY_V2_ENTROPY_ADDRESS,
      PYTH_ENTROPY_V2_DEFAULT_PROVIDER: process.env.PYTH_ENTROPY_V2_DEFAULT_PROVIDER,
      PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT: process.env.PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT,
      PYTH_CASINO_APP_URL: process.env.PYTH_CASINO_APP_URL,
      SLOTS_RANDOMNESS_PROVIDER: process.env.SLOTS_RANDOMNESS_PROVIDER,
      ENABLE_ENTROPY_SLOTS: process.env.ENABLE_ENTROPY_SLOTS,
    }),
    publicEnv: getPublicEnv(),
  };
  return cachedServerEnv;
}

export function isEntropyEnabledForServer() {
  const env = getServerEnv();
  if (env.SLOTS_RANDOMNESS_PROVIDER !== 'pyth_entropy_v2') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return env.ENABLE_ENTROPY_SLOTS;
}
