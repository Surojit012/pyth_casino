import fs from 'node:fs';
import path from 'node:path';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');
const AUTHORITY_PATH = path.join(SCRIPTS_DIR, 'token-authority.json');
const TOKEN_INFO_PATH = path.join(SCRIPTS_DIR, 'token-info.json');
const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

function logStep(message: string) {
  console.log(`\n${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryAirdropWithRetry(
  connection: Connection,
  wallet: Keypair,
  amountLamports: number,
  attempts: number
) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      console.log(`Airdrop attempt ${i}/${attempts}: ${(amountLamports / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
      const sig = await connection.requestAirdrop(wallet.publicKey, amountLamports);
      await connection.confirmTransaction(sig, 'confirmed');
      await sleep(1500);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Airdrop attempt ${i} failed: ${message}`);
      await sleep(1200 * i);
    }
  }
  return false;
}

function ensureScriptsDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
}

function loadOrCreateAuthority(): Keypair {
  if (fs.existsSync(AUTHORITY_PATH)) {
    const raw = fs.readFileSync(AUTHORITY_PATH, 'utf8');
    const secret = Uint8Array.from(JSON.parse(raw));
    return Keypair.fromSecretKey(secret);
  }

  const keypair = Keypair.generate();
  fs.writeFileSync(AUTHORITY_PATH, JSON.stringify(Array.from(keypair.secretKey), null, 2));
  return keypair;
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${suffix}${line}\n`;
}

async function main() {
  ensureScriptsDir();

  logStep('STEP 1 — Connect to devnet');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  logStep('STEP 2 — Load or generate the token authority keypair');
  const authority = loadOrCreateAuthority();
  console.log(`Token authority: ${authority.publicKey.toBase58()}`);

  logStep('STEP 3 — Airdrop SOL if needed');
  let balanceLamports = await connection.getBalance(authority.publicKey);
  if (balanceLamports < 1_000_000_000) {
    const gotTwoSol = await tryAirdropWithRetry(connection, authority, 2_000_000_000, 4);
    if (!gotTwoSol) {
      console.log('Falling back to smaller faucet request...');
      await tryAirdropWithRetry(connection, authority, 1_000_000_000, 4);
    }
    await sleep(2000);
    balanceLamports = await connection.getBalance(authority.publicKey);
    if (balanceLamports < 1_000_000_000) {
      throw new Error(
        `Devnet faucet unavailable right now. Current balance: ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
    }
  }
  console.log(`Balance: ${(balanceLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  logStep('STEP 4 — Create the token mint');
  const mint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    6
  );
  console.log(`Token mint created: ${mint.toBase58()}`);

  logStep('STEP 5 — Create an ATA for the authority wallet');
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey
  );
  console.log(`Authority ATA: ${ata.address.toBase58()}`);

  logStep('STEP 6 — Mint 10,000,000 tokens to the authority ATA');
  const amount = 10_000_000 * (10 ** 6);
  await mintTo(connection, authority, mint, ata.address, authority, BigInt(amount));
  console.log('Minted 10,000,000 surojitpvt tokens');

  logStep('STEP 7 — Save results to scripts/token-info.json');
  const tokenInfo = {
    mintAddress: mint.toBase58(),
    authorityAddress: authority.publicKey.toBase58(),
    authorityATA: ata.address.toBase58(),
    decimals: 6,
    totalSupply: 10000000,
    network: 'devnet',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_INFO_PATH, JSON.stringify(tokenInfo, null, 2));

  logStep('STEP 8 — Auto-update .env.local');
  const existingEnv = fs.existsSync(ENV_LOCAL_PATH) ? fs.readFileSync(ENV_LOCAL_PATH, 'utf8') : '';
  let nextEnv = upsertEnvLine(existingEnv, 'NEXT_PUBLIC_TOKEN_MINT_ADDRESS', mint.toBase58());
  nextEnv = upsertEnvLine(nextEnv, 'NEXT_PUBLIC_TOKEN_AUTHORITY_ADDRESS', authority.publicKey.toBase58());
  fs.writeFileSync(ENV_LOCAL_PATH, nextEnv);
  console.log('.env.local updated with token addresses');

  logStep('STEP 9 — Print summary');
  console.log('================================================');
  console.log('  surojitpvt token created successfully!');
  console.log(`  Mint address: ${mint.toBase58()}`);
  console.log(`  Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
  console.log('  Next step: fund the TREASURY wallet with some of these tokens');
  console.log('  Run: npm run fund-treasury');
  console.log('================================================');
}

main().catch((error) => {
  console.error('\nToken creation script failed:');
  console.error(error);
  process.exit(1);
});
