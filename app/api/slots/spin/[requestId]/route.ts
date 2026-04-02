import { NextResponse } from 'next/server';
import { getWalletFromRequest } from '@/lib/auth';
import { db, normalizeDatabaseError } from '@/lib/db';
import {
  ensureSlotRandomnessRequestsTable,
  getSlotRandomnessRequestForWallet,
} from '@/lib/slotRandomnessRequests';
import { parseRouteParam, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  try {
    parseRouteParam(requestId);
  } catch (error) {
    return validationErrorResponse(error);
  }

  try {
    await ensureSlotRandomnessRequestsTable();
    const record = await getSlotRandomnessRequestForWallet(requestId, walletAddress);

    if (!record) {
      return NextResponse.json({ error: 'Randomness request not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        request: record,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
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
