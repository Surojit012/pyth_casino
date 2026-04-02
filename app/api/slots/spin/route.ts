import { NextResponse } from 'next/server';
import { db, normalizeDatabaseError } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';
import {
  assertEntropyPreparationEnv,
  getConfiguredSlotsRandomnessProviderLabel,
  getConfiguredSlotsRandomnessProviderServer,
} from '@/lib/randomness/provider';
import { resolveSlotsSpin } from '@/lib/randomness/slots';
import { RandomnessProviderNotReadyError } from '@/lib/randomness/types';
import {
  createPendingSlotRandomnessRequest,
  ensureSlotRandomnessRequestsTable,
  failSupersededPendingSlotRandomnessRequests,
} from '@/lib/slotRandomnessRequests';
import { assertTrustedOrigin } from '@/lib/security';
import { parseJsonBody, slotsSpinBodySchema, validationErrorResponse } from '@/lib/validation';

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
  let amount = 0;
  let volatilityMultiplier = 1;
  let startPrice = 0;
  try {
    const body = await parseJsonBody(request, slotsSpinBodySchema);
    amount = body.amount;
    volatilityMultiplier = body.volatilityMultiplier;
    startPrice = body.startPrice ?? 0;
  } catch (error) {
    return validationErrorResponse(error);
  }

  const provider = getConfiguredSlotsRandomnessProviderServer();
  const providerLabel = getConfiguredSlotsRandomnessProviderLabel(provider);

  if (provider === 'pyth_entropy_v2') {
    let contractConfig;
    try {
      contractConfig = assertEntropyPreparationEnv();
    } catch (error) {
      if (error instanceof RandomnessProviderNotReadyError) {
        return NextResponse.json(
          {
            error: 'Slots randomness provider is not ready',
            details: error.message,
            provider: error.provider,
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to initialize slots randomness',
          details: error instanceof Error ? error.message : 'unknown',
        },
        { status: 500 }
      );
    }

    try {
      await ensureSlotRandomnessRequestsTable();
      const userResult = await db.query(
        `SELECT id, balance
         FROM casino_users
         WHERE wallet_address = $1
         LIMIT 1`,
        [walletAddress]
      );

      if (userResult.rowCount === 0) {
        return NextResponse.json({ error: 'User not found. Deposit SOL first.' }, { status: 404 });
      }

      const user = userResult.rows[0];
      const currentBalance = Number(user.balance ?? 0);
      if (currentBalance < amount) {
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
      }

      await failSupersededPendingSlotRandomnessRequests(walletAddress, provider);

      const pendingRequest = await createPendingSlotRandomnessRequest({
        userId: String(user.id),
        walletAddress,
        provider,
        betAmount: amount,
        volatilityMultiplier,
        asset: 'SOL',
        startPrice,
        dataSource: 'Pyth Entropy v2 bridge',
        metadata: {
          contractAddress: contractConfig.contractAddress,
          chainId: contractConfig.chainId,
          providerLabel,
        },
      });

      return NextResponse.json({
        success: true,
        status: 'pending',
        provider,
        providerLabel,
        requestId: pendingRequest.requestId,
        message: 'Waiting for Pyth Entropy v2 bridge fulfillment.',
      });
    } catch (error) {
      const normalized = normalizeDatabaseError(error);
      return NextResponse.json(
        {
          error: 'Failed to queue slots randomness request',
          details: normalized.message,
        },
        { status: 500 }
      );
    }
  }

  let spin;
  try {
    spin = resolveSlotsSpin(volatilityMultiplier, amount);
  } catch (error) {
    if (error instanceof RandomnessProviderNotReadyError) {
      return NextResponse.json(
        {
          error: 'Slots randomness provider is not ready',
          details: error.message,
          provider: error.provider,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to initialize slots randomness',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 }
    );
  }
  const client = await db.connect().catch((error: unknown) => {
    throw normalizeDatabaseError(error);
  });

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id, balance
       FROM casino_users
       WHERE wallet_address = $1
       FOR UPDATE`,
      [walletAddress]
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'User not found. Deposit SOL first.' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const currentBalance = Number(user.balance ?? 0);
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const updatedBalanceResult = await client.query(
      `UPDATE casino_users
       SET balance = balance - $1 + $2
       WHERE id = $3
       RETURNING balance`,
      [amount, spin.payout, user.id]
    );

    await client.query(
      `INSERT INTO casino_transactions (user_id, type, amount, status)
       VALUES ($1, 'bet_placed', $2, 'confirmed')`,
      [user.id, amount]
    );

    if (spin.isWin && spin.payout > 0) {
      await client.query(
        `INSERT INTO casino_transactions (user_id, type, amount, status)
         VALUES ($1, 'win_distributed', $2, 'confirmed')`,
        [user.id, spin.payout]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      status: 'resolved',
      newBalance: Number(updatedBalanceResult.rows[0]?.balance ?? 0),
      ...spin,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Failed to resolve slot spin',
        details: normalized.message,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
