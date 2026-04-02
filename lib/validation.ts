import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { ZodError, z } from 'zod';

const positiveAmount = z.coerce.number().finite().positive();
const nonNegativeNumber = z.coerce.number().finite().min(0);

export const requestIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-z0-9_-]+$/i, 'Invalid request identifier');

export const walletAddressSchema = z
  .string()
  .trim()
  .min(32)
  .max(64)
  .refine((value) => {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid Solana wallet address');

export const txSignatureSchema = z
  .string()
  .trim()
  .min(32)
  .max(128)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid transaction signature');

export const gameSchema = z.enum(['roulette', 'slots', 'liquidation']);
export const resultSchema = z.enum(['win', 'loss']);
export const slotsProviderSchema = z.enum(['local', 'pyth_entropy_v2']);
export const slotsAssetSchema = z.enum(['SOL', 'ETH', 'BTC', 'PYTH']);

export const depositBodySchema = z.object({
  txSignature: txSignatureSchema,
});

export const withdrawBodySchema = z.object({
  amount: positiveAmount.max(10_000),
});

export const betBodySchema = z.object({
  amount: positiveAmount.max(10_000),
  game: gameSchema,
});

export const winBodySchema = z.object({
  amount: positiveAmount.max(100_000),
  game: gameSchema,
});

export const nonceQuerySchema = z.object({
  wallet: walletAddressSchema,
});

export const loginBodySchema = z.object({
  walletAddress: walletAddressSchema,
  signature: z.unknown(),
  nonce: z.string().trim().min(8).max(256),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(48).optional().default(''),
  bio: z.string().trim().max(180).optional().default(''),
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (value) =>
        !value ||
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value),
      'Avatar must be a PNG, JPG, WEBP, or GIF image.'
    )
    .refine((value) => value.length <= 1_500_000, 'Avatar image is too large. Use an image under 1MB.'),
});

export const roundBodySchema = z.object({
  game: gameSchema,
  asset: z.string().trim().min(2).max(16),
  direction: z.string().trim().max(24).optional().nullable(),
  betAmount: positiveAmount.max(10_000),
  payoutAmount: nonNegativeNumber.max(100_000),
  result: resultSchema,
  startPrice: nonNegativeNumber.max(10_000_000),
  endPrice: nonNegativeNumber.max(10_000_000),
  movementPercent: z.coerce.number().finite().min(-1_000).max(1_000),
  volatilityLevel: z.string().trim().min(1).max(24),
  dataSource: z.string().trim().max(120).optional().nullable(),
  proofSignature: z.string().trim().max(256).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const slotsSpinBodySchema = z.object({
  amount: positiveAmount.max(10_000),
  volatilityMultiplier: z.coerce.number().finite().positive().max(10),
  startPrice: nonNegativeNumber.max(10_000_000).optional().default(0),
  asset: slotsAssetSchema.default('SOL'),
});

export const slotsFulfillBodySchema = z.object({
  randomValue: z
    .string()
    .trim()
    .regex(/^0x?[0-9a-fA-F]+$/, 'randomValue must be a hex string'),
  proofRef: z.string().trim().max(256).optional(),
  fulfilledAt: z.string().datetime().optional(),
});

export const rpcProxyRequestSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('pyth.latest'),
    feedIds: z.array(z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/)).min(1).max(8),
  }),
  z.object({
    method: z.literal('pyth.search'),
    query: z.string().trim().min(1).max(32),
    assetType: z.literal('crypto').default('crypto'),
  }),
]);

export function validationErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: error.issues.map((issue) => issue.message).join('; '),
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : 'Validation failed',
    },
    { status: 400 }
  );
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodSchema<T>) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }

  return schema.parse(json);
}

export function parseSearchParams<T>(input: URLSearchParams, schema: z.ZodSchema<T>) {
  const candidate = Object.fromEntries(input.entries());
  return schema.parse(candidate);
}

export function parseRouteParam(value: string | undefined, schema = requestIdSchema) {
  return schema.parse(value);
}

export function sanitizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

export function sanitizeBio(value: string) {
  return value.trim().slice(0, 180);
}
