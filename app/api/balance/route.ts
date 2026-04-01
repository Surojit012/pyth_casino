import { NextResponse } from 'next/server';
import { db, normalizeDatabaseError } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let walletAddress: string;
  try {
    walletAddress = getWalletFromRequest(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await db.query(
      `INSERT INTO casino_users (wallet_address, balance)
       VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
       RETURNING balance`,
      [walletAddress]
    );

    return NextResponse.json({ balance: Number(result.rows[0]?.balance ?? 0) });
  } catch (error) {
    const dbError = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Persistent storage unavailable',
        details: dbError.message,
      },
      { status: 500 }
    );
  }
}
