export function shortenWalletAddress(walletAddress: string) {
  if (!walletAddress) return 'Unknown wallet';
  if (walletAddress.length <= 10) return walletAddress;
  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

export function buildDefaultDisplayName(walletAddress: string) {
  return `Trader ${shortenWalletAddress(walletAddress)}`;
}
