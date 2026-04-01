import fs from 'node:fs';
import path from 'node:path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
} from '@solana/spl-token';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const AUTHORITY_PATH = path.join(SCRIPTS_DIR, 'token-authority.json');
const TOKEN_INFO_PATH = path.join(SCRIPTS_DIR, 'token-info.json');
const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

function parseEnv(content: string) {
  return content
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#'))
    .reduce<Record<string, string>>((acc, line) => {
      const idx = line.indexOf('=');
      if (idx <= 0) return acc;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

async function main() {
  console.log('\nFunding treasury with 5,000,000 tokens on devnet...');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  if (!fs.existsSync(TOKEN_INFO_PATH)) {
    throw new Error('Missing scripts/token-info.json. Run `npm run create-token` first.');
  }
  if (!fs.existsSync(AUTHORITY_PATH)) {
    throw new Error('Missing scripts/token-authority.json. Run `npm run create-token` first.');
  }
  if (!fs.existsSync(ENV_LOCAL_PATH)) {
    throw new Error('Missing .env.local with NEXT_PUBLIC_TREASURY_WALLET_ADDRESS.');
  }

  const tokenInfo = JSON.parse(fs.readFileSync(TOKEN_INFO_PATH, 'utf8')) as {
    mintAddress: string;
    decimals: number;
  };
  const authoritySecret = Uint8Array.from(JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8')));
  const authority = Keypair.fromSecretKey(authoritySecret);
  const env = parseEnv(fs.readFileSync(ENV_LOCAL_PATH, 'utf8'));
  const treasuryWallet = env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS;
  const canonicalMint = env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS || tokenInfo.mintAddress;

  if (!treasuryWallet) {
    throw new Error('NEXT_PUBLIC_TREASURY_WALLET_ADDRESS not found in .env.local');
  }

  if (env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS && env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS !== tokenInfo.mintAddress) {
    console.warn(
      `Warning: scripts/token-info.json points to ${tokenInfo.mintAddress}, but .env.local uses canonical mint ${env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS}. Funding the env mint.`
    );
  }

  const mint = new PublicKey(canonicalMint);
  const treasuryPublicKey = new PublicKey(treasuryWallet);

  const authorityATA = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey
  );
  const treasuryATA = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    treasuryPublicKey
  );

  const amountBaseUnits = BigInt(5_000_000 * (10 ** tokenInfo.decimals));
  const signature = await transfer(
    connection,
    authority,
    authorityATA.address,
    treasuryATA.address,
    authority,
    amountBaseUnits
  );

  console.log(`Transfer signature: ${signature}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((error) => {
  console.error('\nFund treasury script failed:');
  console.error(error);
  process.exit(1);
});
