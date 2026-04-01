# Database Schema

This is the persistent PostgreSQL schema for the Pyth Casino app.

Use it for:
- Supabase SQL editor
- Local Postgres setup
- Production database bootstrap

The live app now expects a real Postgres database.
It no longer silently falls back to `pg-mem` for runtime wallet balances.

The source SQL also lives in:
- [/Users/surojitpvt/Desktop/pyth_casino/lib/schema.sql](/Users/surojitpvt/Desktop/pyth_casino/lib/schema.sql)

## SQL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS casino_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  privy_user_id VARCHAR(100),
  balance DECIMAL(20, 9) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS casino_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES casino_users(id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(20, 9) NOT NULL,
  tx_signature VARCHAR(100) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created_at
ON game_rounds (user_id, created_at DESC);
```

## Table Notes

### `casino_users`
- One row per wallet/user
- `wallet_address` is unique
- `balance` stores the in-app casino ledger balance

### `casino_transactions`
- Stores deposits, withdrawals, bets, wins
- `tx_signature` is unique so deposit verification cannot double-credit the same on-chain transaction
- `user_id` links each transaction to a user record

### `game_rounds`
- Stores resolved game-round history per authenticated wallet
- Includes game type, direction, prices, movement, payout, volatility, and optional JSON metadata
- `proof_signature` lets the round link back to the proof/verification layer when available

## Recommended Next Step

After adding your real `DATABASE_URL` in [`.env.local`](/Users/surojitpvt/Desktop/pyth_casino/.env.local), run this schema in Supabase using:
- SQL Editor in the Supabase dashboard
- or `psql "$DATABASE_URL" -f lib/schema.sql`

## Notes For Supabase

- Use the pooler/Postgres connection string in `DATABASE_URL`
- Hosted Supabase connections typically use `?sslmode=require`
- The app configures the `pg` client with SSL enabled and relaxed certificate verification for the hosted connection
