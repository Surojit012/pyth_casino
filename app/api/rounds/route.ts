import { NextResponse } from 'next/server';
import { db, normalizeDatabaseError } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';
import { ensureGameRoundsTable } from '@/lib/gameRounds';

export const runtime = 'nodejs';

type RoundBody = {
  game: 'roulette' | 'slots' | 'liquidation';
  asset: string;
  direction?: string;
  betAmount: number;
  payoutAmount: number;
  result: 'win' | 'loss';
  startPrice: number;
  endPrice: number;
  movementPercent: number;
  volatilityLevel: string;
  dataSource?: string;
  proofSignature?: string;
  metadata?: Record<string, unknown>;
};

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

  let body: RoundBody;
  try {
    body = (await request.json()) as RoundBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.game || !body.asset || !body.result || !body.volatilityLevel) {
    return NextResponse.json({ error: 'Missing required round fields' }, { status: 400 });
  }

  const numericFields = [
    body.betAmount,
    body.payoutAmount,
    body.startPrice,
    body.endPrice,
    body.movementPercent,
  ];

  if (numericFields.some((value) => !Number.isFinite(Number(value)))) {
    return NextResponse.json({ error: 'Round payload contains invalid numeric fields' }, { status: 400 });
  }

  try {
    await ensureGameRoundsTable();
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Persistent storage unavailable',
        details: normalized.message,
      },
      { status: 503 }
    );
  }

  const client = await db.connect();
  try {
    const userResult = await client.query(
      `SELECT id
       FROM casino_users
       WHERE wallet_address = $1`,
      [walletAddress]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const insertResult = await client.query(
      `INSERT INTO game_rounds (
        user_id,
        game,
        asset,
        direction,
        bet_amount,
        payout_amount,
        result,
        start_price,
        end_price,
        movement_percent,
        volatility_level,
        data_source,
        proof_signature,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      RETURNING id, created_at`,
      [
        userResult.rows[0].id,
        body.game,
        body.asset,
        body.direction ?? null,
        Number(body.betAmount),
        Number(body.payoutAmount),
        body.result,
        Number(body.startPrice),
        Number(body.endPrice),
        Number(body.movementPercent),
        body.volatilityLevel,
        body.dataSource ?? null,
        body.proofSignature ?? null,
        JSON.stringify(body.metadata ?? {}),
      ]
    );

    return NextResponse.json({
      success: true,
      roundId: insertResult.rows[0]?.id,
      createdAt: insertResult.rows[0]?.created_at,
    });
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Failed to persist game round',
        details: normalized.message,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
