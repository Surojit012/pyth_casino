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

CREATE INDEX IF NOT EXISTS idx_slot_randomness_requests_wallet_created_at
ON slot_randomness_requests (wallet_address, created_at DESC);
