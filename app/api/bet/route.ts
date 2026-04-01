import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';
import { assertTrustedOrigin } from '@/lib/security';
import { betBodySchema, parseJsonBody, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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
    assertTrustedOrigin(request);
  } catch (error) {
    return validationErrorResponse(error);
  }
  let amount: number;
  try {
    ({ amount } = await parseJsonBody(request, betBodySchema));
  } catch (error) {
    return validationErrorResponse(error);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock the row to prevent race conditions
    const userResult = await client.query(
      `SELECT id, balance
       FROM casino_users
       WHERE wallet_address = $1
       FOR UPDATE`,
      [walletAddress]
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'User not found. Deposit tokens first.' }, { status: 404 });
    }

    const currentBalance = Number(userResult.rows[0].balance ?? 0);
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const updateBalanceResult = await client.query(
      `UPDATE casino_users
       SET balance = balance - $1
       WHERE wallet_address = $2
       RETURNING balance`,
      [amount, walletAddress]
    );

    await client.query(
      `INSERT INTO casino_transactions (user_id, type, amount, status)
       VALUES ($1, 'bet_placed', $2, 'confirmed')`,
      [userResult.rows[0].id, amount]
    );

    await client.query('COMMIT');
    
    return NextResponse.json({ 
      success: true, 
      newBalance: Number(updateBalanceResult.rows[0]?.balance ?? 0) 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return NextResponse.json(
      { error: 'Failed to place bet', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
