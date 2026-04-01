/**
 * Fix the on-chain PythEntropySlotsConsumer contract by calling setEntropy()
 * with the correct Pyth Entropy address on Base Sepolia.
 *
 * The contract was originally deployed pointing to the Pyth Price Feed oracle
 * (0xA2aa501b...) instead of the Entropy contract (0x41c9e395...).
 */
import fs from 'fs';
import path from 'path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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

const CONTRACT_ADDRESS = process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS as `0x${string}`;
const CORRECT_ENTROPY_ADDRESS = process.env.PYTH_ENTROPY_V2_ENTROPY_ADDRESS as `0x${string}`;
const CHAIN_ID = Number(process.env.PYTH_ENTROPY_V2_CHAIN_ID);
const RPC_URL = process.env.PYTH_ENTROPY_V2_RPC_URL!;
const BRIDGE_PRIVATE_KEY = process.env.PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY as `0x${string}`;

const chain = defineChain({
  id: CHAIN_ID,
  name: `entropy-fix-${CHAIN_ID}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

const account = privateKeyToAccount(BRIDGE_PRIVATE_KEY);
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

const consumerAbi = parseAbi([
  'function entropy() view returns (address)',
  'function owner() view returns (address)',
  'function setEntropy(address nextEntropy)',
]);

async function main() {
  console.log(`\n🔧 Fix Entropy Address on Consumer Contract`);
  console.log(`   Contract:        ${CONTRACT_ADDRESS}`);
  console.log(`   Chain:           ${CHAIN_ID}`);
  console.log(`   Correct Entropy: ${CORRECT_ENTROPY_ADDRESS}`);
  console.log(`   Sender:          ${account.address}\n`);

  // 1. Read current entropy address
  const currentEntropy = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'entropy',
  });
  console.log(`   Current entropy(): ${currentEntropy}`);

  if (currentEntropy.toLowerCase() === CORRECT_ENTROPY_ADDRESS.toLowerCase()) {
    console.log(`\n✅ Already correct! No action needed.`);
    return;
  }

  // 2. Verify we are the owner
  const owner = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'owner',
  });
  console.log(`   Contract owner:    ${owner}`);
  console.log(`   Our address:       ${account.address}`);

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`\n❌ Our wallet is NOT the owner. Cannot call setEntropy().`);
    process.exit(1);
  }

  // 3. Call setEntropy
  console.log(`\n   Calling setEntropy(${CORRECT_ENTROPY_ADDRESS})...`);
  const hash = await walletClient.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'setEntropy',
    args: [CORRECT_ENTROPY_ADDRESS],
    chain,
  });
  console.log(`   Tx hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Tx status: ${receipt.status}`);

  // 4. Verify
  const newEntropy = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: consumerAbi,
    functionName: 'entropy',
  });
  console.log(`\n   New entropy(): ${newEntropy}`);

  if (newEntropy.toLowerCase() === CORRECT_ENTROPY_ADDRESS.toLowerCase()) {
    console.log(`\n✅ Successfully updated entropy address!`);
  } else {
    console.error(`\n❌ Address mismatch after update. Something went wrong.`);
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
