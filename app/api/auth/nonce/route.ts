import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { issueNonce } from '@/lib/nonceStore';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param is required' }, { status: 400 });
  }

  try {
    // Validate wallet format.
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const nonce = issueNonce(wallet);
  return NextResponse.json({ nonce });
}
