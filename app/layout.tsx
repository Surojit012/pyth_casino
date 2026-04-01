import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import { SoundProvider } from "@/context/SoundContext";
import { MarketDataProvider } from "@/context/MarketDataContext";
import { ProofProvider } from "@/context/ProofContext";
import { LiveBetsProvider } from "@/context/LiveBetsContext";
import Navbar from "@/components/Navbar";
import SolanaProvider from "@/components/SolanaProvider";
import PrivyAuthProvider from "@/components/PrivyAuthProvider";
import { getPublicEnv } from "@/lib/env/public";

export const metadata: Metadata = {
  title: "SOL Casino | Where Markets Are The House",
  description: "A crypto casino where outcomes react to live SOL market movement and on-chain settlement.",
  keywords: ["crypto", "casino", "solana", "defi", "trading", "gambling", "sol"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const privyAppId = getPublicEnv().NEXT_PUBLIC_PRIVY_APP_ID || "cl00000000000000000000000";

  return (
    <html lang="en">
      <body>
        <SolanaProvider>
          <PrivyAuthProvider appId={privyAppId}>
            <WalletProvider>
              <SoundProvider>
                <MarketDataProvider>
                  <LiveBetsProvider>
                    <ProofProvider>
                      <div className="page-container">
                        <Navbar />
                        <main className="main-content">
                          {children}
                        </main>
                      </div>
                    </ProofProvider>
                  </LiveBetsProvider>
                </MarketDataProvider>
              </SoundProvider>
            </WalletProvider>
          </PrivyAuthProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}
