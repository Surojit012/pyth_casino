'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type FeedDirection = 'UP' | 'DOWN';
type FeedStatus = 'pending' | 'confirmed';

export interface LiveBetItem {
  id: string;
  wallet: string;
  direction: FeedDirection;
  amountSol: number;
  status: FeedStatus;
  signature?: string;
  createdAt: number;
  justConfirmed?: boolean;
}

interface LiveBetsContextType {
  bets: LiveBetItem[];
  addPendingBet: (input: { wallet: string; direction: FeedDirection; amountSol: number }) => string;
  confirmBet: (id: string, signature: string) => void;
  removeBet: (id: string) => void;
}

const LiveBetsContext = createContext<LiveBetsContextType | undefined>(undefined);
const MAX_BETS = 10;

function capToLastTen(items: LiveBetItem[]) {
  return items.slice(0, MAX_BETS);
}

async function fetchLiveBets(): Promise<LiveBetItem[]> {
  try {
    const response = await fetch('/api/live-bets', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return data.bets || [];
  } catch {
    return [];
  }
}

export function LiveBetsProvider({ children }: { children: React.ReactNode }) {
  const [bets, setBets] = useState<LiveBetItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initial fetch
  useEffect(() => {
    fetchLiveBets().then((initialBets) => {
      setBets(initialBets);
      setIsInitialized(true);
    });
  }, []);

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      fetchLiveBets().then((freshBets) => {
        setBets(freshBets);
      });
    }, 10_000);

    return () => clearInterval(interval);
  }, [isInitialized]);

  const addPendingBet = useCallback((input: { wallet: string; direction: FeedDirection; amountSol: number }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextItem: LiveBetItem = {
      id,
      wallet: input.wallet,
      direction: input.direction,
      amountSol: input.amountSol,
      status: 'pending',
      createdAt: Date.now(),
    };

    setBets(prev => capToLastTen([nextItem, ...prev]));
    return id;
  }, []);

  const confirmBet = useCallback((id: string, signature: string) => {
    setBets(prev => capToLastTen(prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        status: 'confirmed',
        signature,
        justConfirmed: true,
      };
    })));

    setTimeout(() => {
      setBets(prev => prev.map(item => (item.id === id ? { ...item, justConfirmed: false } : item)));
    }, 1200);

    // Refresh from server after confirmation
    setTimeout(() => {
      fetchLiveBets().then((freshBets) => {
        setBets(freshBets);
      });
    }, 2000);
  }, []);

  const removeBet = useCallback((id: string) => {
    setBets(prev => prev.filter(item => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({ bets, addPendingBet, confirmBet, removeBet }),
    [bets, addPendingBet, confirmBet, removeBet]
  );

  return (
    <LiveBetsContext.Provider value={value}>
      {children}
    </LiveBetsContext.Provider>
  );
}

export function useLiveBets() {
  const context = useContext(LiveBetsContext);
  if (!context) throw new Error('useLiveBets must be used within LiveBetsProvider');
  return context;
}
