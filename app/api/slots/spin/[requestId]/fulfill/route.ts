import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { calculateSlotPayout } from '@/lib/entropy';
import { db, normalizeDatabaseError } from '@/lib/db';
import { getServerEnv } from '@/lib/env/server';
import { ensureGameRoundsTable } from '@/lib/gameRounds';
import { deriveSlotsOutcomeFromSeed } from '@/lib/randomness/derive';
import { ensureSlotRandomnessRequestsTable } from '@/lib/slotRandomnessRequests';
import { parseJsonBody, parseRouteParam, slotsFulfillBodySchema, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

function getBridgeSecret() {
  const env = getServerEnv();
  return env.PYTH_ENTROPY_V2_BRIDGE_SECRET?.trim() || env.JWT_SECRET?.trim() || '';
}

function verifyBridgeSecret(request: Request) {
  const expected = getBridgeSecret();
  if (!expected) {
    throw new Error('Entropy bridge secret is not configured');
  }

  const provided = request.headers.get('x-entropy-bridge-secret')?.trim();
  if (!provided || provided !== expected) {
    throw new Error('Invalid bridge secret');
  }
}

function normalizeRandomValue(input: string) {
  const sanitized = input.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(sanitized)) {
    throw new Error('randomValue must be a hex string');
  }

  return sanitized.padEnd(24, '0');
}

export async function POST(request: Request, context: RouteContext) {
  try {
    verifyBridgeSecret(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized bridge request' },
      { status: 401 }
    );
  }

  const { requestId } = await context.params;
  try {
    parseRouteParam(requestId);
  } catch (error) {
    return validationErrorResponse(error);
  }

  let body: { randomValue: string; proofRef?: string; fulfilledAt?: string };
  try {
    body = await parseJsonBody(request, slotsFulfillBodySchema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  let randomnessSeed: string;
  try {
    const randomValue = normalizeRandomValue(String(body.randomValue ?? ''));
    randomnessSeed = createHash('sha256').update(randomValue).digest('hex').slice(0, 24);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid random value' },
      { status: 400 }
    );
  }

  try {
    await ensureSlotRandomnessRequestsTable();
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

  const client = await db.connect().catch((error: unknown) => {
    throw normalizeDatabaseError(error);
  });

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT *
       FROM slot_randomness_requests
       WHERE request_id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Randomness request not found' }, { status: 404 });
    }

    const randomnessRequest = requestResult.rows[0];
    if (String(randomnessRequest.status) === 'fulfilled') {
      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        status: 'fulfilled',
        requestId,
        message: 'Randomness request already fulfilled',
      });
    }

    if (String(randomnessRequest.status) === 'failed') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Randomness request has already failed' }, { status: 409 });
    }

    const userResult = await client.query(
      `SELECT id, balance
       FROM casino_users
       WHERE id = $1
       FOR UPDATE`,
      [randomnessRequest.user_id]
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Casino user not found for randomness request' }, { status: 404 });
    }

    const symbols = deriveSlotsOutcomeFromSeed(randomnessSeed);
    const betAmount = Number(randomnessRequest.bet_amount ?? 0);
    const volatilityMultiplier = Number(randomnessRequest.volatility_multiplier ?? 1);
    const payout = calculateSlotPayout(symbols, betAmount, volatilityMultiplier);
    const currentBalance = Number(userResult.rows[0].balance ?? 0);
    const newBalance = currentBalance - betAmount + payout.payout;
    const fulfilledAt = body.fulfilledAt ? new Date(body.fulfilledAt) : new Date();
    const proofRef = body.proofRef?.trim() || `entropyv2_${requestId}`;

    await client.query(
      `UPDATE casino_users
       SET balance = $1
       WHERE id = $2`,
      [newBalance, randomnessRequest.user_id]
    );

    await client.query(
      `INSERT INTO casino_transactions (user_id, type, amount, status)
       VALUES ($1, 'bet_placed', $2, 'confirmed')`,
      [randomnessRequest.user_id, betAmount]
    );

    if (payout.isWin && payout.payout > 0) {
      await client.query(
        `INSERT INTO casino_transactions (user_id, type, amount, status)
         VALUES ($1, 'win_distributed', $2, 'confirmed')`,
        [randomnessRequest.user_id, payout.payout]
      );
    }

    const requestMetadata = {
      ...((randomnessRequest.metadata as Record<string, unknown> | null) ?? {}),
      proofRef,
      fulfilledAt: fulfilledAt.toISOString(),
      matchType: payout.matchType,
      multiplier: payout.multiplier,
      newBalance,
    };

    await client.query(
      `UPDATE slot_randomness_requests
       SET status = 'fulfilled',
           randomness_seed = $2,
           resolved_symbols = $3::jsonb,
           payout_amount = $4,
           metadata = $5::jsonb,
           updated_at = NOW()
       WHERE request_id = $1`,
      [
        requestId,
        randomnessSeed,
        JSON.stringify(symbols),
        payout.payout,
        JSON.stringify(requestMetadata),
      ]
    );

    await client.query(
      `INSERT INTO game_rounds (
        user_id,
        game,
        asset,
        bet_amount,
        payout_amount,
        result,
        start_price,
        end_price,
        movement_percent,
        volatility_level,
        data_source,
        proof_signature,
        metadata,
        created_at
      )
      VALUES ($1, 'slots', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [
        randomnessRequest.user_id,
        String(randomnessRequest.asset ?? 'SOL'),
        betAmount,
        payout.payout,
        payout.isWin ? 'win' : 'loss',
        Number(randomnessRequest.start_price ?? 0),
        Number(randomnessRequest.start_price ?? 0),
        0,
        volatilityMultiplier >= 1.5 ? 'HIGH' : volatilityMultiplier >= 1.2 ? 'MEDIUM' : 'LOW',
        String(randomnessRequest.data_source ?? 'Pyth Entropy v2'),
        proofRef,
        JSON.stringify({
          symbols,
          matchType: payout.matchType,
          multiplier: payout.multiplier,
          volatilityMultiplier,
          randomnessSeed,
          randomnessProvider: randomnessRequest.provider,
          randomnessRequestId: requestId,
          settledBy: 'entropy_bridge',
        }),
        fulfilledAt,
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      status: 'fulfilled',
      requestId,
      result: {
        symbols,
        payout: payout.payout,
        multiplier: payout.multiplier,
        isWin: payout.isWin,
        matchType: payout.matchType,
        randomnessSeed,
        proofRef,
        newBalance,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Failed to fulfill randomness request',
        details: normalized.message,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
