import { randomBytes } from 'crypto';
import { db } from '@/lib/db';

let ensureSlotRandomnessRequestsPromise: Promise<void> | null = null;

export type SlotRandomnessRequestStatus = 'pending' | 'fulfilled' | 'failed';

export interface CreatePendingSlotRandomnessRequestInput {
  userId: string;
  walletAddress: string;
  provider: string;
  betAmount: number;
  volatilityMultiplier: number;
  asset: string;
  startPrice: number;
  dataSource?: string;
  metadata?: Record<string, unknown>;
}

export interface PendingSlotRandomnessRequest {
  id: string;
  requestId: string;
  provider: string;
  status: SlotRandomnessRequestStatus;
  betAmount: number;
  volatilityMultiplier: number;
  asset: string;
  startPrice: number;
  dataSource: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SlotRandomnessRequestRecord {
  id: string;
  requestId: string;
  provider: string;
  status: SlotRandomnessRequestStatus;
  betAmount: number;
  volatilityMultiplier: number;
  asset: string;
  startPrice: number;
  dataSource: string | null;
  randomnessSeed: string | null;
  resolvedSymbols: string[] | null;
  payoutAmount: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function mapRecord(row: Record<string, unknown>): SlotRandomnessRequestRecord {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    provider: String(row.provider),
    status: String(row.status) as SlotRandomnessRequestStatus,
    betAmount: Number(row.bet_amount ?? 0),
    volatilityMultiplier: Number(row.volatility_multiplier ?? 0),
    asset: String(row.asset),
    startPrice: Number(row.start_price ?? 0),
    dataSource: row.data_source ? String(row.data_source) : null,
    randomnessSeed: row.randomness_seed ? String(row.randomness_seed) : null,
    resolvedSymbols: Array.isArray(row.resolved_symbols) ? (row.resolved_symbols as string[]) : null,
    payoutAmount: row.payout_amount !== null && row.payout_amount !== undefined ? Number(row.payout_amount) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function ensureSlotRandomnessRequestsTable() {
  if (!ensureSlotRandomnessRequestsPromise) {
    ensureSlotRandomnessRequestsPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS slot_randomness_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id TEXT NOT NULL UNIQUE,
          user_id UUID NOT NULL REFERENCES casino_users(id) ON DELETE CASCADE,
          wallet_address VARCHAR(44) NOT NULL,
          provider VARCHAR(32) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'pending',
          bet_amount DECIMAL(20, 9) NOT NULL,
          volatility_multiplier DECIMAL(20, 9) NOT NULL,
          asset VARCHAR(16) NOT NULL,
          start_price DECIMAL(20, 9) NOT NULL,
          data_source TEXT,
          randomness_seed TEXT,
          resolved_symbols JSONB,
          payout_amount DECIMAL(20, 9),
          error_message TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_slot_randomness_requests_wallet_created_at
        ON slot_randomness_requests (wallet_address, created_at DESC);
      `);
    })().catch((error) => {
      ensureSlotRandomnessRequestsPromise = null;
      throw error;
    });
  }

  await ensureSlotRandomnessRequestsPromise;
}

export async function createPendingSlotRandomnessRequest(
  input: CreatePendingSlotRandomnessRequestInput
): Promise<PendingSlotRandomnessRequest> {
  const requestId = `entropyv2_${Date.now()}_${randomBytes(6).toString('hex')}`;

  const result = await db.query(
    `INSERT INTO slot_randomness_requests (
      request_id,
      user_id,
      wallet_address,
      provider,
      status,
      bet_amount,
      volatility_multiplier,
      asset,
      start_price,
      data_source,
      metadata
    )
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING *`,
    [
      requestId,
      input.userId,
      input.walletAddress,
      input.provider,
      input.betAmount,
      input.volatilityMultiplier,
      input.asset,
      input.startPrice,
      input.dataSource ?? null,
      JSON.stringify({
        note: 'Entropy v2 bridge skeleton pending fulfillment',
        phase: 'skeleton',
        ...(input.metadata ?? {}),
      }),
    ]
  );

  const row = mapRecord(result.rows[0]);
  return {
    id: row.id,
    requestId: row.requestId,
    provider: row.provider,
    status: row.status,
    betAmount: row.betAmount,
    volatilityMultiplier: row.volatilityMultiplier,
    asset: row.asset,
    startPrice: row.startPrice,
    dataSource: row.dataSource,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getSlotRandomnessRequestForWallet(requestId: string, walletAddress: string) {
  const result = await db.query(
    `SELECT *
     FROM slot_randomness_requests
     WHERE request_id = $1
       AND wallet_address = $2
     LIMIT 1`,
    [requestId, walletAddress]
  );

  if (result.rowCount === 0) return null;
  return mapRecord(result.rows[0]);
}

export async function getSlotRandomnessRequestById(requestId: string) {
  const result = await db.query(
    `SELECT *
     FROM slot_randomness_requests
     WHERE request_id = $1
     LIMIT 1`,
    [requestId]
  );

  if (result.rowCount === 0) return null;
  return mapRecord(result.rows[0]);
}
