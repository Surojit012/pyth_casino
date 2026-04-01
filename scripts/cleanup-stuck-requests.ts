#!/usr/bin/env tsx
/**
 * Cleanup script for stuck Pyth Entropy v2 randomness requests
 * 
 * This script marks old pending requests as failed so they don't
 * block the worker from processing new requests.
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in environment');
  process.exit(1);
}

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

const db = new Pool({
  connectionString: normalizeConnectionString(DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('🔍 Checking for stuck randomness requests...\n');

  // Find all pending requests older than 5 minutes
  const result = await db.query(
    `SELECT request_id, wallet_address, bet_amount, created_at, metadata
     FROM slot_randomness_requests
     WHERE provider = 'pyth_entropy_v2'
       AND status = 'pending'
       AND created_at < NOW() - INTERVAL '5 minutes'
     ORDER BY created_at ASC`
  );

  if (result.rowCount === 0) {
    console.log('✅ No stuck requests found. All clear!');
    await db.end();
    return;
  }

  console.log(`Found ${result.rowCount} stuck request(s):\n`);
  
  for (const row of result.rows) {
    const metadata = row.metadata as Record<string, unknown> | null;
    const sequenceNumber = metadata?.sequenceNumber ?? 'none';
    console.log(`  - Request: ${row.request_id}`);
    console.log(`    Wallet: ${row.wallet_address}`);
    console.log(`    Amount: ${row.bet_amount} SOL`);
    console.log(`    Created: ${row.created_at}`);
    console.log(`    Sequence: ${sequenceNumber}`);
    console.log('');
  }

  console.log('🧹 Marking these requests as failed...\n');

  const updateResult = await db.query(
    `UPDATE slot_randomness_requests
     SET status = 'failed',
         error_message = 'Request timed out - cleaned up by maintenance script',
         updated_at = NOW()
     WHERE provider = 'pyth_entropy_v2'
       AND status = 'pending'
       AND created_at < NOW() - INTERVAL '5 minutes'`
  );

  console.log(`✅ Marked ${updateResult.rowCount} request(s) as failed`);
  console.log('\n💡 These requests will no longer block the worker.');
  console.log('   Users can try spinning again with fresh requests.\n');

  await db.end();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
