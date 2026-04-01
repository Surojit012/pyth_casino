'use client';

import { PrivyProvider } from '@privy-io/react-auth';

interface PrivyAuthProviderProps {
  appId: string;
  children: React.ReactNode;
}

export default function PrivyAuthProvider({ appId, children }: PrivyAuthProviderProps) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
