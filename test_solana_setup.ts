import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

function parseEnv(content: string) {
  return content
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#'))
    .reduce<Record<string, string>>((acc, line) => {
      const idx = line.indexOf('=');
      if (idx <= 0) return acc;
      acc[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      return acc;
    }, {});
}

async function check() {
  const env = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
  const RPC_URL = env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const MINT_ADDRESS = env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS;
  const TREASURY_WALLET = env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS;

  if (!MINT_ADDRESS || !TREASURY_WALLET) {
    throw new Error('NEXT_PUBLIC_TOKEN_MINT_ADDRESS and NEXT_PUBLIC_TREASURY_WALLET_ADDRESS must exist in .env.local');
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const mintPubkey = new PublicKey(MINT_ADDRESS);
  const treasuryPubkey = new PublicKey(TREASURY_WALLET);

  console.log('Checking Mint:', MINT_ADDRESS);
  try {
    const info = await connection.getAccountInfo(mintPubkey);
    if (!info) {
      console.error('Mint not found on Devnet!');
    } else {
      console.log('Mint Owner:', info.owner.toBase58());
      const isToken2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
      console.log('Is Token-2022:', isToken2022);
      
      const mintData = await getMint(connection, mintPubkey, 'confirmed', info.owner);
      console.log('Mint Decimals:', mintData.decimals);
      console.log('Mint Supply:', mintData.supply.toString());
    }
  } catch (e) {
    console.error('Error fetching mint:', e);
  }

  console.log('\nChecking Treasury Wallet:', TREASURY_WALLET);
  try {
    const info = await connection.getAccountInfo(treasuryPubkey);
    if (!info) {
      console.error('Treasury wallet not found on Devnet! (Maybe no SOL balance)');
    } else {
      console.log('Treasury Balance (SOL):', info.lamports / 1e9);
    }
  } catch (e) {
    console.error('Error fetching treasury:', e);
  }
}

check();
