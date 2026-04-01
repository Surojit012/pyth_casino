import { NextResponse } from 'next/server';
import { getWalletFromRequest } from '@/lib/auth';
import { db, normalizeDatabaseError } from '@/lib/db';
import {
  ensureSlotRandomnessRequestsTable,
  getSlotRandomnessRequestForWallet,
} from '@/lib/slotRandomnessRequests';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  let walletAddress: string;
  try {
    walletAddress = getWalletFromRequest(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }

  const { requestId } = await context.params;
  if (!requestId) {
    return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
  }

  try {
    await ensureSlotRandomnessRequestsTable();
    const record = await getSlotRandomnessRequestForWallet(requestId, walletAddress);

    if (!record) {
      return NextResponse.json({ error: 'Randomness request not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: record,
    });
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Failed to read slots randomness request',
        details: normalized.message,
      },
      { status: 500 }
    );
  }
}
