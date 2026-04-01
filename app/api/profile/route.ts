import { NextResponse } from 'next/server';
import { getWalletFromRequest } from '@/lib/auth';
import { db, normalizeDatabaseError } from '@/lib/db';
import { buildDefaultDisplayName } from '@/lib/profile';
import { ensureUserProfileColumns } from '@/lib/profileDb';
import { assertTrustedOrigin } from '@/lib/security';
import {
  parseJsonBody,
  profileUpdateSchema,
  sanitizeBio,
  sanitizeDisplayName,
  validationErrorResponse,
} from '@/lib/validation';

export const runtime = 'nodejs';

function sanitizeAvatarUrl(value: unknown) {
  const avatar = String(value ?? '').trim();
  if (!avatar) return '';
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(avatar)) {
    throw new Error('Avatar must be a PNG, JPG, WEBP, or GIF image.');
  }
  if (avatar.length > 1_500_000) {
    throw new Error('Avatar image is too large. Use an image under 1MB.');
  }
  return avatar;
}

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
    await ensureUserProfileColumns();

    const userResult = await db.query(
      `SELECT id, wallet_address, balance, created_at, updated_at, display_name, avatar_url, bio
       FROM casino_users
       WHERE wallet_address = $1
       LIMIT 1`,
      [walletAddress]
    );

    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: 'User not found. Deposit SOL first.' }, { status: 404 });
    }

    const user = userResult.rows[0];

    const statsResult = await db.query(
      `SELECT
          COUNT(*)::int AS total_rounds,
          COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
          COALESCE(SUM(bet_amount), 0) AS total_wagered,
          COALESCE(SUM(payout_amount), 0) AS total_payout,
          COALESCE(SUM(CASE WHEN payout_amount > 0 THEN payout_amount - bet_amount ELSE 0 END), 0) AS gross_profit,
          COALESCE(MAX(created_at), NULL) AS last_round_at
       FROM game_rounds
       WHERE user_id = $1`,
      [user.id]
    );

    const roundsResult = await db.query(
      `SELECT
          id,
          game,
          asset,
          direction,
          bet_amount,
          payout_amount,
          result,
          movement_percent,
          volatility_level,
          proof_signature,
          created_at
       FROM game_rounds
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [user.id]
    );

    const transactionsResult = await db.query(
      `SELECT type, amount, tx_signature, status, created_at
       FROM casino_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [user.id]
    );

    const stats = statsResult.rows[0];
    const totalRounds = Number(stats?.total_rounds ?? 0);
    const wins = Number(stats?.wins ?? 0);

    return NextResponse.json({
      success: true,
      profile: {
        walletAddress: user.wallet_address,
        displayName: user.display_name || buildDefaultDisplayName(user.wallet_address),
        avatarUrl: user.avatar_url || '',
        bio: user.bio || '',
        balance: Number(user.balance ?? 0),
        joinedAt: user.created_at,
        updatedAt: user.updated_at,
      },
      stats: {
        totalRounds,
        wins,
        losses: Math.max(0, totalRounds - wins),
        winRate: totalRounds > 0 ? (wins / totalRounds) * 100 : 0,
        totalWagered: Number(stats?.total_wagered ?? 0),
        totalPayout: Number(stats?.total_payout ?? 0),
        grossProfit: Number(stats?.gross_profit ?? 0),
        lastRoundAt: stats?.last_round_at ?? null,
      },
      recentRounds: roundsResult.rows.map((row) => ({
        id: row.id,
        game: row.game,
        asset: row.asset,
        direction: row.direction,
        betAmount: Number(row.bet_amount ?? 0),
        payoutAmount: Number(row.payout_amount ?? 0),
        result: row.result,
        movementPercent: Number(row.movement_percent ?? 0),
        volatilityLevel: row.volatility_level,
        proofSignature: row.proof_signature,
        createdAt: row.created_at,
      })),
      recentTransactions: transactionsResult.rows.map((row) => ({
        type: row.type,
        amount: Number(row.amount ?? 0),
        txSignature: row.tx_signature,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      { error: 'Failed to load profile', details: normalized.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
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
  let body: { displayName?: string; bio?: string; avatarUrl?: string };
  try {
    body = await parseJsonBody(request, profileUpdateSchema);
  } catch (error) {
    return validationErrorResponse(error);
  }

  const displayName = sanitizeDisplayName(body.displayName ?? '');
  const bio = sanitizeBio(body.bio ?? '');
  let avatarUrl = '';
  try {
    avatarUrl = sanitizeAvatarUrl(body.avatarUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid avatar image.' },
      { status: 400 }
    );
  }

  try {
    await ensureUserProfileColumns();

    const result = await db.query(
      `UPDATE casino_users
       SET display_name = $1,
           avatar_url = $2,
           bio = $3,
           updated_at = NOW()
       WHERE wallet_address = $4
       RETURNING wallet_address, display_name, avatar_url, bio, balance, created_at, updated_at`,
      [displayName || null, avatarUrl || null, bio || null, walletAddress]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const user = result.rows[0];
    return NextResponse.json({
      success: true,
      profile: {
        walletAddress: user.wallet_address,
        displayName: user.display_name || buildDefaultDisplayName(user.wallet_address),
        avatarUrl: user.avatar_url || '',
        bio: user.bio || '',
        balance: Number(user.balance ?? 0),
        joinedAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: normalized.message },
      { status: 500 }
    );
  }
}
