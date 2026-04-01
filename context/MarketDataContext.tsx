'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchMultiplePrices, getPriceChangePercent } from '@/lib/pyth';
import {
  calculateRollingVolatility,
  classifyVolatility,
  getDangerLevel,
  getMarketMood,
  PRICE_LOOKBACK_TICKS,
  type DangerLevel,
  type MarketMood,
  type VolatilityLevel,
} from '@/lib/volatility';

export type MarketAsset = 'BTC' | 'ETH' | 'SOL';

export interface MarketTick {
  price: number;
  timestamp: number;
  source: 'anchor' | 'simulated';
}

export interface AssetMarketState {
  asset: MarketAsset;
  price: number;
  previousPrice: number;
  direction: 'up' | 'down' | 'flat';
  change15s: number;
  volatility: number;
  volatilityLevel: VolatilityLevel;
  mood: MarketMood;
  dangerLevel: DangerLevel;
  ticks: MarketTick[];
  updatedAt: number;
}

interface MarketDataContextValue {
  assets: Record<MarketAsset, AssetMarketState>;
  sourceLabel: string;
}

export interface UseMarketDataResult {
  assets: Record<MarketAsset, AssetMarketState>;
  current?: AssetMarketState;
  sourceLabel: string;
}

const MARKET_ASSETS: MarketAsset[] = ['BTC', 'ETH', 'SOL'];
const INITIAL_PRICES: Record<MarketAsset, number> = {
  BTC: 67432.5,
  ETH: 3521.8,
  SOL: 142.35,
};

const TICK_INTERVAL_MS = 250;
const ANCHOR_INTERVAL_MS = 2500;
const MAX_TICKS = 180;
// Reduced jitter to prevent cash-out timing exploits
const MAX_JITTER_PCT = 0.00001;
const SOURCE_LABEL = 'Powered by Pyth | Data: Hermes (live anchor + micro-stream)';

const MarketDataContext = createContext<MarketDataContextValue | undefined>(undefined);

function createInitialState(asset: MarketAsset, price: number): AssetMarketState {
  const now = Date.now();
  return {
    asset,
    price,
    previousPrice: price,
    direction: 'flat',
    change15s: 0,
    volatility: 0,
    volatilityLevel: 'LOW',
    mood: 'Market Calm',
    dangerLevel: 'SAFE',
    ticks: [{ price, timestamp: now, source: 'anchor' }],
    updatedAt: now,
  };
}

function deriveAssetState(previous: AssetMarketState, nextPrice: number, source: MarketTick['source']): AssetMarketState {
  const timestamp = Date.now();
  const ticks = [...previous.ticks, { price: nextPrice, timestamp, source }].slice(-MAX_TICKS);
  const prices = ticks.map(t => t.price);
  const volatility = calculateRollingVolatility(prices);
  const volatilityLevel = classifyVolatility(volatility);
  const lookbackTick = ticks[Math.max(0, ticks.length - PRICE_LOOKBACK_TICKS)] ?? ticks[0];
  const change15s = getPriceChangePercent(lookbackTick.price, nextPrice);
  const direction =
    nextPrice > previous.price ? 'up'
      : nextPrice < previous.price ? 'down'
        : 'flat';

  return {
    ...previous,
    previousPrice: previous.price,
    price: nextPrice,
    direction,
    change15s,
    volatility,
    volatilityLevel,
    mood: getMarketMood(change15s),
    dangerLevel: getDangerLevel(volatility),
    ticks,
    updatedAt: timestamp,
  };
}

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Record<MarketAsset, AssetMarketState>>(() => ({
    BTC: createInitialState('BTC', INITIAL_PRICES.BTC),
    ETH: createInitialState('ETH', INITIAL_PRICES.ETH),
    SOL: createInitialState('SOL', INITIAL_PRICES.SOL),
  }));

  const assetsRef = useRef(assets);
  const initializedRef = useRef(false);
  const lastAnchorTsRef = useRef(0);
  const anchorPrevRef = useRef<Record<MarketAsset, number>>({ ...INITIAL_PRICES });
  const anchorNextRef = useRef<Record<MarketAsset, number>>({ ...INITIAL_PRICES });

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const fetchAnchors = useCallback(async () => {
    try {
      const priceData = await fetchMultiplePrices(MARKET_ASSETS);
      const nextPrices: Record<MarketAsset, number> = {
        BTC: priceData.find(p => p.asset === 'BTC')?.price ?? assetsRef.current.BTC.price,
        ETH: priceData.find(p => p.asset === 'ETH')?.price ?? assetsRef.current.ETH.price,
        SOL: priceData.find(p => p.asset === 'SOL')?.price ?? assetsRef.current.SOL.price,
      };

      if (!initializedRef.current) {
        anchorPrevRef.current = { ...nextPrices };
        anchorNextRef.current = { ...nextPrices };
        lastAnchorTsRef.current = Date.now();
        initializedRef.current = true;

        setAssets(prev => ({
          BTC: deriveAssetState(prev.BTC, nextPrices.BTC, 'anchor'),
          ETH: deriveAssetState(prev.ETH, nextPrices.ETH, 'anchor'),
          SOL: deriveAssetState(prev.SOL, nextPrices.SOL, 'anchor'),
        }));
        return;
      }

      anchorPrevRef.current = {
        BTC: assetsRef.current.BTC.price,
        ETH: assetsRef.current.ETH.price,
        SOL: assetsRef.current.SOL.price,
      };
      anchorNextRef.current = nextPrices;
      lastAnchorTsRef.current = Date.now();
    } catch {
      // Keep streaming from the previous anchor data on transient failures.
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => {
      void fetchAnchors();
    }, 0);
    const interval = setInterval(() => {
      void fetchAnchors();
    }, ANCHOR_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [fetchAnchors]);

  useEffect(() => {
    const tickTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastAnchorTsRef.current;
      const progress = Math.max(0, Math.min(1, elapsed / ANCHOR_INTERVAL_MS));

      setAssets(previous => {
        const nextState = { ...previous };

        MARKET_ASSETS.forEach((asset, index) => {
          const from = anchorPrevRef.current[asset];
          const to = anchorNextRef.current[asset];
          const interpolated = from + (to - from) * progress;
          const jitterBase = interpolated * MAX_JITTER_PCT;
          const wave = Math.sin(now / 170 + index * 1.9);
          const random = (Math.random() - 0.5) * 0.6;
          const jitter = jitterBase * (1 - progress) * (wave + random);
          const price = Math.max(0.0001, interpolated + jitter);

          nextState[asset] = deriveAssetState(previous[asset], price, 'simulated');
        });

        return nextState;
      });
    }, TICK_INTERVAL_MS);

    return () => clearInterval(tickTimer);
  }, []);

  return (
    <MarketDataContext.Provider value={{ assets, sourceLabel: SOURCE_LABEL }}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketData(asset?: MarketAsset): UseMarketDataResult {
  const context = useContext(MarketDataContext);
  if (!context) throw new Error('useMarketData must be used within MarketDataProvider');

  return {
    assets: context.assets,
    current: asset ? context.assets[asset] : undefined,
    sourceLabel: context.sourceLabel,
  };
}
