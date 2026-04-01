function readRequired(name: string, value?: string) {
  if (!value) {
    throw new Error(`${name} is not configured. Add it to .env.local and restart npm run dev.`);
  }
  return value;
}

export function getRpcNetworkLabel(rpcUrl: string) {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes('devnet')) return 'devnet';
  if (lower.includes('mainnet')) return 'mainnet';
  if (lower.includes('testnet')) return 'testnet';
  return 'configured network';
}

export function getExplorerClusterParam(rpcUrl: string) {
  const networkLabel = getRpcNetworkLabel(rpcUrl);
  if (networkLabel === 'mainnet') return '';
  if (networkLabel === 'devnet') return '?cluster=devnet';
  if (networkLabel === 'testnet') return '?cluster=testnet';
  return '';
}

export function getRequiredClientTokenEnv() {
  const rpcUrl = readRequired('NEXT_PUBLIC_SOLANA_RPC_URL', process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  const treasuryWallet = readRequired(
    'NEXT_PUBLIC_TREASURY_WALLET_ADDRESS',
    process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS
  );

  return {
    rpcUrl,
    treasuryWallet,
    networkLabel: getRpcNetworkLabel(rpcUrl),
    explorerClusterParam: getExplorerClusterParam(rpcUrl),
  };
}

export function getRequiredServerTokenEnv() {
  const rpcUrl = readRequired('NEXT_PUBLIC_SOLANA_RPC_URL', process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  const treasuryWallet = readRequired(
    'NEXT_PUBLIC_TREASURY_WALLET_ADDRESS',
    process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS
  );

  return {
    rpcUrl,
    treasuryWallet,
    networkLabel: getRpcNetworkLabel(rpcUrl),
  };
}
