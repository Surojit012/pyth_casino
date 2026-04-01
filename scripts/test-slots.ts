import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import crypto from 'crypto';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(ENV_PATH);

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

const DATABASE_URL = process.env.DATABASE_URL!;
const db = new Pool({
  connectionString: normalizeConnectionString(DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('🎰 Testing Volatility Slots in the background by simulating a bet...');
  
  // Create or get a test user
  const WALLET_ADDRESS = 'TestSimulatedWalletAddress123456789';
  let userResult = await db.query('SELECT id FROM casino_users WHERE wallet_address = $1', [WALLET_ADDRESS]);
  let userId;
  
  if (userResult.rowCount === 0) {
    console.log('Creating test user...');
    const result = await db.query(
      `INSERT INTO casino_users (wallet_address, balance) VALUES ($1, 1000) RETURNING id`,
      [WALLET_ADDRESS]
    );
    userId = result.rows[0].id;
  } else {
    userId = userResult.rows[0].id;
    // ensure sufficient balance
    await db.query(`UPDATE casino_users SET balance = 1000 WHERE id = $1`, [userId]);
  }
  
  const betAmount = 10;
  const volatilityMultiplier = 2.0;

  // Deduct balance and create request simulating the API Route behavior
  await db.query(`UPDATE casino_users SET balance = balance - $1 WHERE id = $2`, [betAmount, userId]);
  
  const requestId = 'entropyv2_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
  
  console.log(`Inserting request ${requestId} into slot_randomness_requests table...`);
  
  await db.query(`
    INSERT INTO slot_randomness_requests (
      request_id, user_id, wallet_address, provider, status, bet_amount, volatility_multiplier, asset, start_price, data_source, metadata, resolved_symbols
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
  `, [
    requestId, 
    userId, 
    WALLET_ADDRESS, 
    'pyth_entropy_v2', 
    'pending', 
    betAmount, 
    volatilityMultiplier, 
    'SOL', 
    150, 
    'Pyth Entropy v2 bridge',
    JSON.stringify({
      contractAddress: process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS,
      chainId: process.env.PYTH_ENTROPY_V2_CHAIN_ID,
      providerLabel: 'base-sepolia'
    }),
    JSON.stringify([])
  ]);
  
  console.log(`✅ Bet placed! Bridge worker should pick it up automatically.`);
  console.log(`Waiting 30 seconds for worker to process and fulfill the hit...`);
  
  // Monitor the table for updates
  const interval = setInterval(async () => {
    const check = await db.query(`SELECT status, payout_amount, error_message FROM slot_randomness_requests WHERE request_id = $1`, [requestId]);
    const row = check.rows[0];
    
    if (row.status !== 'pending') {
      console.log(`\n🎉 Test completed! Final status: ${row.status}`);
      if (row.status === 'resolved') {
        console.log(`Payout amount: ${row.payout_amount} SOL`);
      } else {
        console.error(`Error: ${row.error_message}`);
      }
      clearInterval(interval);
      process.exit(0);
    } else {
      process.stdout.write('.');
    }
  }, 2000);
  
  setTimeout(() => {
    console.error('\n❌ Timeout reached. Worker did not fulfill in 30 seconds.');
    clearInterval(interval);
    process.exit(1);
  }, 35000);
}

void main().catch(console.error);
