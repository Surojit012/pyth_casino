import { NextResponse } from 'next/server';
import { db, normalizeDatabaseError } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GameRoundRow = {
  id: string;
  user_id: string;
  game: string;
  bet_amount: string;
  payout_amount: string;
  result: string;
  created_at: Date;
  metadata: Record<string, unknown> | null;
};

type UserRow = {
  wallet_address: string;
};

export async function GET() {
  try {
    // Fetch last 10 game rounds with user wallet addresses
    const result = await db.query<GameRoundRow & UserRow>(
      `SELECT 
        gr.id,
        gr.game,
        gr.bet_amount,
        gr.payout_amount,
        gr.result,
        gr.created_at,
        gr.metadata,
        cu.wallet_address
       FROM game_rounds gr
       JOIN casino_users cu ON gr.user_id = cu.id
       ORDER BY gr.created_at DESC
       LIMIT 10`
    );

    const bets = result.rows.map((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      const isWin = row.result === 'win';
      
      // Determine direction based on game type and result
      let direction: 'UP' | 'DOWN';
      if (row.game === 'slots') {
        direction = isWin ? 'UP' : 'DOWN';
      } else {
        // For roulette, check metadata for bet type
        const betType = metadata?.betType as string | undefined;
        direction = betType === 'red' || betType === 'high' ? 'UP' : 'DOWN';
      }

      return {
        id: row.id,
        wallet: row.wallet_address,
        direction,
        amountSol: Number(row.bet_amount),
        status: 'confirmed' as const,
        createdAt: new Date(row.created_at).getTime(),
        game: row.game,
        payout: Number(row.payout_amount),
        isWin,
      };
    });

    return NextResponse.json({ bets });
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      { error: 'Failed to fetch live bets', details: normalized.message },
      { status: 500 }
    );
  }
}
