import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ORIGIN: z.string().trim().url().optional(),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().trim().url().default('https://api.devnet.solana.com'),
  NEXT_PUBLIC_ROULETTE_PROGRAM_ID: z.string().trim().optional().default(''),
  NEXT_PUBLIC_PYTH_BTC_FEED_ACCOUNT: z.string().trim().optional().default(''),
  NEXT_PUBLIC_VAULT_PUBKEY: z.string().trim().optional().default(''),
  NEXT_PUBLIC_TREASURY_WALLET_ADDRESS: z.string().trim().optional().default(''),
  NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER: z.enum(['local', 'pyth_entropy_v2']).default('local'),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().trim().optional().default(''),
  NEXT_PUBLIC_TOKEN_MINT_ADDRESS: z.string().trim().optional().default(''),
  NEXT_PUBLIC_TOKEN_AUTHORITY_ADDRESS: z.string().trim().optional().default(''),
});

let cachedPublicEnv: z.infer<typeof publicEnvSchema> | null = null;

export function getPublicEnv() {
  if (cachedPublicEnv) return cachedPublicEnv;
  cachedPublicEnv = publicEnvSchema.parse({
    NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_ROULETTE_PROGRAM_ID: process.env.NEXT_PUBLIC_ROULETTE_PROGRAM_ID,
    NEXT_PUBLIC_PYTH_BTC_FEED_ACCOUNT: process.env.NEXT_PUBLIC_PYTH_BTC_FEED_ACCOUNT,
    NEXT_PUBLIC_VAULT_PUBKEY: process.env.NEXT_PUBLIC_VAULT_PUBKEY,
    NEXT_PUBLIC_TREASURY_WALLET_ADDRESS: process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS,
    NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER: process.env.NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_TOKEN_MINT_ADDRESS: process.env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS,
    NEXT_PUBLIC_TOKEN_AUTHORITY_ADDRESS: process.env.NEXT_PUBLIC_TOKEN_AUTHORITY_ADDRESS,
  });
  return cachedPublicEnv;
}
