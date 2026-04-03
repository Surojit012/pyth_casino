type NonceRecord = {
  nonce: string;
  expires: number;
};

declare global {
  var __pythCasinoNonceStore: Map<string, NonceRecord> | undefined;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const nonceStore = global.__pythCasinoNonceStore || new Map<string, NonceRecord>();

if (process.env.NODE_ENV !== 'production') {
  global.__pythCasinoNonceStore = nonceStore;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [wallet, record] of nonceStore.entries()) {
    if (record.expires <= now) {
      nonceStore.delete(wallet);
    }
  }
}

export function issueNonce(wallet: string) {
  cleanupExpired();
  const nonce = `Sign in to SOL Casino: ${crypto.randomUUID()}`;
  nonceStore.set(wallet, {
    nonce,
    expires: Date.now() + FIVE_MINUTES_MS,
  });
  return nonce;
}

export function getNonce(wallet: string) {
  cleanupExpired();
  return nonceStore.get(wallet);
}

export function consumeNonce(wallet: string) {
  nonceStore.delete(wallet);
}
