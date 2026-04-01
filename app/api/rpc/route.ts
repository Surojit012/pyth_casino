import { NextResponse } from 'next/server';
import { buildHermesLatestUrl, buildHermesSearchUrl } from '@/lib/rpcProxy';
import { assertTrustedOrigin } from '@/lib/security';
import { parseJsonBody, rpcProxyRequestSchema, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const body = await parseJsonBody(request, rpcProxyRequestSchema);
    const targetUrl =
      body.method === 'pyth.latest'
        ? buildHermesLatestUrl(body.feedIds)
        : buildHermesSearchUrl(body.query, body.assetType);

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return validationErrorResponse(error);
  }
}
