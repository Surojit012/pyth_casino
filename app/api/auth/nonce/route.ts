import { NextResponse } from 'next/server';
import { issueNonce } from '@/lib/nonceStore';
import { assertTrustedOrigin } from '@/lib/security';
import { nonceQuerySchema, parseSearchParams, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    assertTrustedOrigin(request);
    const { searchParams } = new URL(request.url);
    const { wallet } = parseSearchParams(searchParams, nonceQuerySchema);
    const nonce = issueNonce(wallet);
    return NextResponse.json({ nonce });
  } catch (error) {
    return validationErrorResponse(error);
  }
}
