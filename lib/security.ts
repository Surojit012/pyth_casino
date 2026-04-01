export function getExpectedOrigin(request?: Request) {
  const configured = process.env.PYTH_CASINO_APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  if (request) {
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host =
      request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      new URL(request.url).host;
    return `${proto}://${host}`;
  }

  return null;
}

export function assertTrustedOrigin(request: Request) {
  const expectedOrigin = getExpectedOrigin(request);
  if (!expectedOrigin) return;

  const origin = request.headers.get('origin');
  if (!origin) return;

  if (origin.replace(/\/$/, '') !== expectedOrigin) {
    throw new Error('Untrusted request origin');
  }
}

export function assertBrowserDomain() {
  if (typeof window === 'undefined') return;
  const expected = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '');
  if (!expected) return;

  const current = window.location.origin.replace(/\/$/, '');
  if (current !== expected) {
    throw new Error('Signing is only allowed from the app’s trusted domain.');
  }
}
