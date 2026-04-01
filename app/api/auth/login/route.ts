import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { db } from '@/lib/db';
import { consumeNonce, getNonce } from '@/lib/nonceStore';
import { signCasinoJwt } from '@/lib/auth';

export const runtime = 'nodejs';

type LoginBody = {
  walletAddress: string;
  signature: unknown;
  nonce: string;
};

function normalizeSignatureInput(signature: unknown) {
  if (Array.isArray(signature)) {
    return new Uint8Array(signature.map((value) => Number(value)));
  }

  if (typeof signature === 'string') {
    return new Uint8Array(Buffer.from(signature, 'base64'));
  }

  if (signature && typeof signature === 'object') {
    const candidate = signature as { signature?: unknown; data?: unknown; type?: string };
    if (candidate.signature !== undefined) return normalizeSignatureInput(candidate.signature);
    const bufferData = candidate.data;
    if (candidate.type === 'Buffer' && Array.isArray(bufferData)) {
      return new Uint8Array((bufferData as unknown[]).map((value) => Number(value)));
    }
    if (candidate.data !== undefined) return normalizeSignatureInput(candidate.data);
  }

  return null;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { walletAddress, signature, nonce } = body;
  if (!walletAddress || signature === undefined || !nonce) {
    return NextResponse.json(
      { error: 'walletAddress, signature[], and nonce are required' },
      { status: 400 }
    );
  }

  const stored = getNonce(walletAddress);
  if (!stored) {
    return NextResponse.json({ error: 'Nonce not found' }, { status: 401 });
  }
  if (stored.expires < Date.now()) {
    consumeNonce(walletAddress);
    return NextResponse.json({ error: 'Nonce expired' }, { status: 401 });
  }
  if (stored.nonce !== nonce) {
    return NextResponse.json({ error: 'Nonce mismatch' }, { status: 401 });
  }

  let isValid = false;
  try {
    const messageBytes = new TextEncoder().encode(stored.nonce);
    const signatureBytes = normalizeSignatureInput(signature);
    if (!signatureBytes || signatureBytes.length !== 64) {
      return NextResponse.json({ error: 'Invalid Phantom signature payload' }, { status: 400 });
    }
    const pubkeyBytes = new PublicKey(walletAddress).toBytes();
    isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid Phantom signature' }, { status: 401 });
  }

  try {
    await db.query(
      `INSERT INTO casino_users (wallet_address, balance)
       VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress]
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to upsert user', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }

  const token = signCasinoJwt(walletAddress);
  consumeNonce(walletAddress);
  return NextResponse.json({ token, walletAddress });
}
