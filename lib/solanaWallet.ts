import type { WalletName } from '@solana/wallet-adapter-base';

export const PHANTOM_WALLET_NAME = 'Phantom' as WalletName<'Phantom'>;

export function isPhantomWalletName(name?: string | null) {
  return name === PHANTOM_WALLET_NAME;
}

export function shortenWalletAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
