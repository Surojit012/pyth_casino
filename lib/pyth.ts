import { buildHermesLatestUrl, buildHermesSearchUrl } from '@/lib/rpcProxy';

export const FEED_IDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};

export const ASSET_SYMBOLS: Record<string, string> = {
  BTC: 'btc',
  ETH: 'eth',
  PYTH: 'pyth',
  SOL: 'sol',
};

export const ASSET_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  PYTH: 'Pyth Network',
  SOL: 'Solana',
};

export interface PriceData {
  asset: string;
  price: number;
  confidence: number;
  timestamp: number;
  expo: number;
}

const MOCK_PRICES: Record<string, number> = {
  BTC: 67432.5,
  ETH: 3521.8,
  PYTH: 0.52,
  SOL: 142.35,
};

let useMock = false;
const resolvedFeedIds: Record<string, string> = { ...FEED_IDS };

function normalizeFeedId(feedId: string) {
  const trimmed = feedId.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function enableMockTemporarily() {
  if (useMock) return;
  console.warn('Pyth API failed, using mock data for 30s...');
  useMock = true;
  setTimeout(() => {
    useMock = false;
  }, 30_000);
}

async function fetchPythJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  if (typeof window === 'undefined') {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Pyth request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Pyth proxy request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchPrice(asset: string): Promise<PriceData> {
  const feedId = await getFeedId(asset);
  if (!feedId) throw new Error(`Unknown asset: ${asset}`);

  if (useMock) {
    return getMockPrice(asset);
  }

  try {
    const data = await fetchPythJson<{
      parsed?: Array<{
        price: {
          price: string;
          conf: string;
          expo: number;
          publish_time?: number;
        };
        publish_time?: number;
      }>;
    }>(buildHermesLatestUrl([feedId]), {
      method: 'pyth.latest',
      feedIds: [feedId],
    });

    const parsed = data.parsed?.[0];
    if (!parsed) {
      enableMockTemporarily();
      return getMockPrice(asset);
    }

    const priceData = parsed.price;
    const price = Number(priceData.price) * Math.pow(10, priceData.expo);
    const confidence = Number(priceData.conf) * Math.pow(10, priceData.expo);
    const publishTime = priceData.publish_time ?? parsed.publish_time ?? 0;

    return {
      asset,
      price,
      confidence,
      timestamp: publishTime * 1000,
      expo: priceData.expo,
    };
  } catch (error) {
    console.warn('Pyth API error:', error);
    enableMockTemporarily();
    return getMockPrice(asset);
  }
}

async function getFeedId(asset: string): Promise<string | undefined> {
  if (resolvedFeedIds[asset]) return normalizeFeedId(resolvedFeedIds[asset]);

  try {
    const feeds = await fetchPythJson<
      Array<{
        id?: string;
        attributes?: {
          base?: string;
          quote_currency?: string;
          symbol?: string;
        };
      }>
    >(buildHermesSearchUrl(asset, 'crypto'), {
      method: 'pyth.search',
      query: asset,
      assetType: 'crypto',
    });

    const exact = feeds.find((feed) => {
      const base = String(feed.attributes?.base ?? '').toUpperCase();
      const quote = String(feed.attributes?.quote_currency ?? '').toUpperCase();
      const symbol = String(feed.attributes?.symbol ?? '').toUpperCase();
      return feed.id && ((base === asset && quote === 'USD') || symbol === `${asset}/USD`);
    });

    if (exact?.id) {
      const normalized = normalizeFeedId(exact.id);
      resolvedFeedIds[asset] = normalized;
      return normalized;
    }
  } catch (error) {
    console.warn(`Failed to resolve feed id for ${asset}:`, error);
  }

  return undefined;
}

function getMockPrice(asset: string): PriceData {
  const basePrice = MOCK_PRICES[asset] || 100;
  const variation = (Math.random() - 0.5) * basePrice * 0.002;
  const price = basePrice + variation;

  return {
    asset,
    price,
    confidence: price * 0.001,
    timestamp: Date.now(),
    expo: -8,
  };
}

export async function fetchMultiplePrices(assets: string[]): Promise<PriceData[]> {
  return Promise.all(assets.map(fetchPrice));
}

export function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function getPriceChangePercent(startPrice: number, endPrice: number): number {
  return ((endPrice - startPrice) / startPrice) * 100;
}
