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

function randomDirection(): FeedDirection {
  return Math.random() > 0.5 ? 'UP' : 'DOWN';
}

function randomAmount() {
  return Number((Math.random() * 0.35 + 0.02).toFixed(3));
}

function randomMockWallet() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 44; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function createMockConfirmedBet(offsetMs: number): LiveBetItem {
  return {
    id: `seed-${offsetMs}`,
    wallet: randomMockWallet(),
    direction: randomDirection(),
    amountSol: randomAmount(),
    status: 'confirmed',
    signature: randomMockWallet(),
    createdAt: Date.now() - offsetMs,
  };
}

export function LiveBetsProvider({ children }: { children: React.ReactNode }) {
  const [bets, setBets] = useState<LiveBetItem[]>(() => ([
    createMockConfirmedBet(6_000),
    createMockConfirmedBet(18_000),
    createMockConfirmedBet(31_000),
  ]));

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
  }, []);

  const removeBet = useCallback((id: string) => {
    setBets(prev => prev.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const id = addPendingBet({
        wallet: randomMockWallet(),
        direction: randomDirection(),
        amountSol: randomAmount(),
      });

      setTimeout(() => {
        confirmBet(id, randomMockWallet());
      }, 1400);
    }, 12_000);

    return () => clearInterval(interval);
  }, [addPendingBet, confirmBet]);

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
