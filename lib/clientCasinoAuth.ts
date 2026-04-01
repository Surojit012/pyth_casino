'use client';

const JWT_STORAGE_KEY = 'casino_jwt';
const JWT_WALLET_STORAGE_KEY = 'casino_jwt_wallet';

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function readCasinoJwt(expectedWallet?: string) {
  const storage = getStorage();
  if (!storage) return '';

  const token = storage.getItem(JWT_STORAGE_KEY) ?? '';
  const wallet = storage.getItem(JWT_WALLET_STORAGE_KEY) ?? '';
  if (!token) return '';
  if (expectedWallet && wallet && wallet !== expectedWallet) return '';
  return token;
}

export function readCasinoJwtWallet() {
  const storage = getStorage();
  if (!storage) return '';
  return storage.getItem(JWT_WALLET_STORAGE_KEY) ?? '';
}

export function persistCasinoJwt(token: string, walletAddress: string) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(JWT_STORAGE_KEY, token);
  storage.setItem(JWT_WALLET_STORAGE_KEY, walletAddress);
}

export function clearCasinoJwt() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(JWT_STORAGE_KEY);
  storage.removeItem(JWT_WALLET_STORAGE_KEY);
}

export function hasCasinoJwt(expectedWallet?: string) {
  return Boolean(readCasinoJwt(expectedWallet));
}
