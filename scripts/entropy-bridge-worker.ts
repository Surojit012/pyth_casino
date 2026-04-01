import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  keccak256,
  parseAbi,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const STATE_PATH = path.join(ROOT, 'scripts', '.entropy-bridge-state.json');
const LOOP_INTERVAL_MS = 3_000; // Poll every 3 seconds for faster response
const LOG_BACKFILL_BLOCKS = BigInt(50); // Reduced from 250 to scan fewer old blocks

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

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

const DATABASE_URL = requiredEnv('DATABASE_URL');
const CONTRACT_ADDRESS = requiredEnv('PYTH_ENTROPY_V2_CONTRACT_ADDRESS') as `0x${string}`;
const ENTROPY_ADDRESS = requiredEnv('PYTH_ENTROPY_V2_ENTROPY_ADDRESS') as `0x${string}`;
const CHAIN_ID = Number(requiredEnv('PYTH_ENTROPY_V2_CHAIN_ID'));
const RPC_URL = requiredEnv('PYTH_ENTROPY_V2_RPC_URL');
const BRIDGE_PRIVATE_KEY = requiredEnv('PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY') as `0x${string}`;
const BRIDGE_SECRET = requiredEnv('PYTH_ENTROPY_V2_BRIDGE_SECRET');
const APP_URL = optionalEnv('PYTH_CASINO_APP_URL', 'http://localhost:3000').replace(/\/$/, '');

const chain = defineChain({
  id: CHAIN_ID,
  name: `entropy-bridge-${CHAIN_ID}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

const account = privateKeyToAccount(BRIDGE_PRIVATE_KEY);
const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC_URL),
});

const consumerAbi = parseAbi([
  'function entropy() view returns (address)',
  'function requestSlotsRandomness(bytes32 userCommitment) payable returns (uint64 sequenceNumber)',
  'event EntropyRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 commitment, uint32 gasLimit)',
  'event EntropyFulfilled(uint64 indexed sequenceNumber, bytes32 randomNumber)',
]);

const entropyAbi = parseAbi([
  'function getFeeV2() view returns (uint128)',
  'event Revealed(address indexed provider, address indexed caller, uint64 indexed sequenceNumber, bytes32 randomNumber, bytes32 userContribution, bytes32 providerContribution, bool callbackFailed, bytes callbackReturnValue, uint32 callbackGasUsed, bytes extraArgs)',
]);

type WorkerState = {
  lastProcessedBlock: string;
};

type PendingRequestRow = {
  request_id: string;
  metadata: Record<string, unknown> | null;
};

function readState(): WorkerState | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as WorkerState;
  } catch {
    return null;
  }
}

function writeState(state: WorkerState) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
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

async function ensureSlotRandomnessRequestsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS slot_randomness_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id TEXT UNIQUE NOT NULL,
      user_id UUID REFERENCES casino_users(id) ON DELETE CASCADE,
      wallet_address VARCHAR(44) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      bet_amount DECIMAL(20, 9) NOT NULL,
      volatility_multiplier DECIMAL(10, 4) NOT NULL,
      asset VARCHAR(16) NOT NULL DEFAULT 'SOL',
      start_price DECIMAL(20, 8) NOT NULL,
      data_source TEXT,
      randomness_seed TEXT,
      resolved_symbols JSONB,
      payout_amount DECIMAL(20, 9),
      error_message TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getPendingRequestsWithoutSequence() {
  const result = await db.query<PendingRequestRow>(
    `SELECT request_id, metadata
     FROM slot_randomness_requests
     WHERE provider = 'pyth_entropy_v2'
       AND status = 'pending'
       AND COALESCE(metadata->>'sequenceNumber', '') = ''
     ORDER BY created_at ASC
     LIMIT 25`
  );
  return result.rows;
}

async function setRequestMetadata(requestId: string, patch: Record<string, unknown>) {
  await db.query(
    `UPDATE slot_randomness_requests
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE request_id = $1`,
    [requestId, JSON.stringify(patch)]
  );
}

async function markRequestFailed(requestId: string, message: string, patch: Record<string, unknown> = {}) {
  await db.query(
    `UPDATE slot_randomness_requests
     SET status = 'failed',
         error_message = $2,
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
         updated_at = NOW()
     WHERE request_id = $1`,
    [requestId, message, JSON.stringify(patch)]
  );
}

async function findPendingRequestIdBySequence(sequenceNumber: string) {
  const result = await db.query<{ request_id: string }>(
    `SELECT request_id
     FROM slot_randomness_requests
     WHERE provider = 'pyth_entropy_v2'
       AND status = 'pending'
       AND metadata->>'sequenceNumber' = $1
     LIMIT 1`,
    [sequenceNumber]
  );
  return result.rows[0]?.request_id ?? null;
}

function buildCommitment(requestId: string) {
  return keccak256(stringToHex(requestId));
}

async function submitPendingRequest(request: PendingRequestRow) {
  const startTime = Date.now();
  console.log(`[bridge] submitting ${request.request_id}...`);
  
  // Read the entropy address from the on-chain consumer for diagnostics
  const onChainEntropyAddress = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'entropy',
  });

  // Warn if the on-chain consumer has a mismatched entropy address
  if (onChainEntropyAddress.toLowerCase() !== ENTROPY_ADDRESS.toLowerCase()) {
    console.warn(
      `[bridge] WARNING: consumer contract entropy() returns ${onChainEntropyAddress} but env ENTROPY_ADDRESS is ${ENTROPY_ADDRESS}. ` +
      `Using env address for fee lookup. The consumer contract may need redeployment.`
    );
  }

  // Use the env-based ENTROPY_ADDRESS for fee lookup (on-chain consumer may have wrong address)
  const fee = await publicClient.readContract({
    address: ENTROPY_ADDRESS,
    abi: entropyAbi,
    functionName: 'getFeeV2',
  });

  const commitment = buildCommitment(request.request_id);
  const hash = await walletClient.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'requestSlotsRandomness',
    args: [commitment],
    value: fee,
    chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const requestLog = receipt.logs.find((log) => {
    try {
      const decoded = decodeEventLog({
        abi: consumerAbi,
        data: log.data,
        topics: log.topics,
      });
      return decoded.eventName === 'EntropyRequested';
    } catch {
      return false;
    }
  });

  if (!requestLog) {
    throw new Error(`EntropyRequested event not found in tx ${hash}`);
  }

  const decoded = decodeEventLog({
    abi: consumerAbi,
    data: requestLog.data,
    topics: requestLog.topics,
  });

  const sequenceNumber = String(decoded.args.sequenceNumber);

  await setRequestMetadata(request.request_id, {
    sequenceNumber,
    bridgeTxHash: hash,
    bridgeSubmittedAt: new Date().toISOString(),
    bridgeContractAddress: CONTRACT_ADDRESS,
    bridgeChainId: String(CHAIN_ID),
    commitment,
  });

  const elapsed = Date.now() - startTime;
  console.log(`[bridge] submitted ${request.request_id} -> sequence ${sequenceNumber} tx ${hash} (${elapsed}ms)`);
}

async function submitNewPendingRequests() {
  const pendingRequests = await getPendingRequestsWithoutSequence();
  for (const request of pendingRequests) {
    try {
      await submitPendingRequest(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      await setRequestMetadata(request.request_id, {
        bridgeLastError: message,
        bridgeLastErrorAt: new Date().toISOString(),
      });
      console.error(`[bridge] failed to submit ${request.request_id}: ${message}`);
    }
  }
}

async function callFulfillEndpoint(requestId: string, randomValue: string, proofRef: string) {
  const response = await fetch(`${APP_URL}/api/slots/spin/${requestId}/fulfill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-entropy-bridge-secret': BRIDGE_SECRET,
    },
    body: JSON.stringify({
      randomValue,
      proofRef,
      fulfilledAt: new Date().toISOString(),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Fulfill route failed with status ${response.status}`);
  }

  return payload;
}

async function processFulfillments() {
  const latestBlock = await publicClient.getBlockNumber();
  const state = readState();
  let fromBlock = state?.lastProcessedBlock
    ? BigInt(state.lastProcessedBlock) > LOG_BACKFILL_BLOCKS
      ? BigInt(state.lastProcessedBlock) - LOG_BACKFILL_BLOCKS
      : BigInt(0)
    : latestBlock > LOG_BACKFILL_BLOCKS
      ? latestBlock - LOG_BACKFILL_BLOCKS
      : BigInt(0);

  if (fromBlock > latestBlock) {
    return;
  }

  const maxRange = BigInt(100); // Reduced from 250 for faster scanning
  while (fromBlock <= latestBlock) {
    const toBlock = fromBlock + maxRange > latestBlock ? latestBlock : fromBlock + maxRange;
    const consumerLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock,
      toBlock,
    });
    const entropyLogs = await publicClient.getLogs({
      address: ENTROPY_ADDRESS,
      fromBlock,
      toBlock,
    });

    for (const log of entropyLogs) {
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: entropyAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        continue;
      }

      if (decoded.eventName !== 'Revealed') continue;
      if (String(decoded.args.caller).toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) continue;

      const sequenceNumber = String(decoded.args.sequenceNumber);
      const requestId = await findPendingRequestIdBySequence(sequenceNumber);
      if (!requestId) continue;

      const callbackFailed = Boolean(decoded.args.callbackFailed);
      const randomValue = String(decoded.args.randomNumber);
      const proofRef = `${log.transactionHash}:${sequenceNumber}`;

      if (callbackFailed) {
        await markRequestFailed(requestId, 'Entropy callback failed on-chain.', {
          revealTxHash: log.transactionHash,
          revealBlockNumber: log.blockNumber?.toString?.() ?? null,
          sequenceNumber,
          callbackFailed: true,
        });
        console.error(`[bridge] entropy callback failed for ${requestId} sequence ${sequenceNumber}`);
        continue;
      }

      try {
        const fulfillStart = Date.now();
        await callFulfillEndpoint(requestId, randomValue, proofRef);
        const fulfillElapsed = Date.now() - fulfillStart;
        console.log(`[bridge] fulfilled ${requestId} from entropy reveal sequence ${sequenceNumber} (${fulfillElapsed}ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        await setRequestMetadata(requestId, {
          bridgeRevealFulfillError: message,
          bridgeRevealFulfillErrorAt: new Date().toISOString(),
        });
        console.error(`[bridge] failed to fulfill ${requestId} from reveal: ${message}`);
      }
    }

    for (const log of consumerLogs) {
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: consumerAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        continue;
      }

      if (decoded.eventName !== 'EntropyFulfilled') continue;

      const sequenceNumber = String(decoded.args.sequenceNumber);
      const randomValue = String(decoded.args.randomNumber);
      const requestId = await findPendingRequestIdBySequence(sequenceNumber);
      if (!requestId) {
        console.log(`[bridge] fulfillment for sequence ${sequenceNumber} has no pending request mapping`);
        continue;
      }

      const proofRef = `${log.transactionHash}:${sequenceNumber}`;

      try {
        const fulfillStart = Date.now();
        await callFulfillEndpoint(requestId, randomValue, proofRef);
        const fulfillElapsed = Date.now() - fulfillStart;
        console.log(`[bridge] fulfilled ${requestId} from consumer event sequence ${sequenceNumber} (${fulfillElapsed}ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        await setRequestMetadata(requestId, {
          bridgeFulfillError: message,
          bridgeFulfillErrorAt: new Date().toISOString(),
        });
        console.error(`[bridge] failed to fulfill ${requestId}: ${message}`);
      }
    }

    writeState({ lastProcessedBlock: toBlock.toString() });
    fromBlock = toBlock + BigInt(1);
  }
}

async function runCycle() {
  await submitNewPendingRequests();
  await processFulfillments();
}

async function startLoop() {
  try {
    await runCycle();
  } catch (error) {
    console.error('[bridge] cycle error', error);
  } finally {
    setTimeout(startLoop, LOOP_INTERVAL_MS);
  }
}

async function main() {
  console.log(`[bridge] starting Entropy bridge worker for contract ${CONTRACT_ADDRESS} on chain ${CHAIN_ID}`);
  await ensureSlotRandomnessRequestsTable();
  await startLoop();
}

void main().catch((error) => {
  console.error('[bridge] fatal error', error);
  process.exit(1);
});
