'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';
import { getPublicEnv } from '@/lib/env/public';

export default function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const env = getPublicEnv();
  const endpoint = useMemo(
    () => env.NEXT_PUBLIC_SOLANA_RPC_URL,
    [env.NEXT_PUBLIC_SOLANA_RPC_URL]
  );
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
