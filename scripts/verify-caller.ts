import fs from 'fs';
import path from 'path';
import { createPublicClient, http, parseAbi } from 'viem';
import { defineChain } from 'viem';

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

const chain = defineChain({
  id: 84532,
  name: 'base-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.PYTH_ENTROPY_V2_RPC_URL!] },
  },
});

const client = createPublicClient({ chain, transport: http(process.env.PYTH_ENTROPY_V2_RPC_URL) });

const entropyAbi = parseAbi([
  'event Revealed(address indexed provider, address indexed caller, uint64 indexed sequenceNumber, bytes32 randomNumber, bytes32 userContribution, bytes32 providerContribution, bool callbackFailed, bytes callbackReturnValue, uint32 callbackGasUsed, bytes extraArgs)',
]);

async function main() {
  const logs = await client.getLogs({
    address: '0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c',
    event: entropyAbi[0],
    fromBlock: BigInt(39627773),
  });
  
  const log = logs.find(l => Number(l.args.sequenceNumber) === 30054);
  if (log) {
    console.log('Caller from Reveal log:', log.args.caller);
    console.log('Expected caller (from .env):', process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS);
    if (String(log.args.caller).toLowerCase() !== String(process.env.PYTH_ENTROPY_V2_CONTRACT_ADDRESS).toLowerCase()) {
      console.log('⚠️ MISMATCH DETECTED! The bridge worker filter requires caller === CONTRACT_ADDRESS');
    } else {
      console.log('✅ Caller matches exactly.');
    }
  } else {
    console.log('Log 30054 not found.');
  }
}

main().catch(console.error).finally(() => process.exit(0));
