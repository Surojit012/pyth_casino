import { db } from '@/lib/db';

let ensureRoundsTablePromise: Promise<void> | null = null;

export async function ensureGameRoundsTable() {
  if (!ensureRoundsTablePromise) {
    ensureRoundsTablePromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS game_rounds (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES casino_users(id) ON DELETE CASCADE,
          game VARCHAR(32) NOT NULL,
          asset VARCHAR(16) NOT NULL,
          direction VARCHAR(16),
          bet_amount DECIMAL(20, 9) NOT NULL,
          payout_amount DECIMAL(20, 9) NOT NULL DEFAULT 0,
          result VARCHAR(16) NOT NULL,
          start_price DECIMAL(20, 9) NOT NULL,
          end_price DECIMAL(20, 9) NOT NULL,
          movement_percent DECIMAL(20, 9) NOT NULL DEFAULT 0,
          volatility_level VARCHAR(16) NOT NULL,
          data_source TEXT,
          proof_signature TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created_at
        ON game_rounds (user_id, created_at DESC);
      `);
    })().catch((error) => {
      ensureRoundsTablePromise = null;
      throw error;
    });
  }

  await ensureRoundsTablePromise;
}
