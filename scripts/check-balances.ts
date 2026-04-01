import fs from 'node:fs';
import path from 'node:path';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

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

async function logWalletBalances(connection: Connection, mint: PublicKey, wallet: PublicKey) {
  const ata = await getAssociatedTokenAddress(mint, wallet);

  let tokenBalance = '0';
  const ataInfo = await connection.getAccountInfo(ata, 'confirmed');
  if (ataInfo) {
    const tokenBalanceInfo = await connection.getTokenAccountBalance(ata, 'confirmed');
    tokenBalance = tokenBalanceInfo.value.uiAmountString ?? '0';
  }

  const solBalance = await connection.getBalance(wallet, 'confirmed');
  console.log(`\nWallet: ${wallet.toBase58()}`);
  console.log(`ATA: ${ata.toBase58()}`);
  console.log(`Token balance: ${tokenBalance}`);
  console.log(`SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
}

async function main() {
  if (!fs.existsSync(TOKEN_INFO_PATH)) {
    throw new Error('Missing scripts/token-info.json. Run `npm run create-token` first.');
  }
  if (!fs.existsSync(AUTHORITY_PATH)) {
    throw new Error('Missing scripts/token-authority.json. Run `npm run create-token` first.');
  }

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const tokenInfo = JSON.parse(fs.readFileSync(TOKEN_INFO_PATH, 'utf8')) as {
    mintAddress: string;
  };
  const authoritySecret = Uint8Array.from(JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8')));
  const authority = Keypair.fromSecretKey(authoritySecret);
  const env = fs.existsSync(ENV_LOCAL_PATH)
    ? parseEnv(fs.readFileSync(ENV_LOCAL_PATH, 'utf8'))
    : {};
  const canonicalMint = env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS || tokenInfo.mintAddress;
  if (env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS && env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS !== tokenInfo.mintAddress) {
    console.warn(
      `Warning: scripts/token-info.json points to ${tokenInfo.mintAddress}, but .env.local uses canonical mint ${env.NEXT_PUBLIC_TOKEN_MINT_ADDRESS}. Checking the env mint.`
    );
  }
  const mint = new PublicKey(canonicalMint);

  const argWallet = process.argv[2];
  if (argWallet) {
    await logWalletBalances(connection, mint, new PublicKey(argWallet));
    return;
  }
  const treasury = env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS;

  console.log('No wallet arg provided. Checking authority + treasury wallets.');
  await logWalletBalances(connection, mint, authority.publicKey);

  if (treasury) {
    await logWalletBalances(connection, mint, new PublicKey(treasury));
  } else {
    console.log('\nNEXT_PUBLIC_TREASURY_WALLET_ADDRESS not found in .env.local');
  }
}

main().catch((error) => {
  console.error('\nCheck balances script failed:');
  console.error(error);
  process.exit(1);
});
