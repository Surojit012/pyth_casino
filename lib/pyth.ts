// Pyth Hermes API wrapper
// Uses Pyth Hermes REST API for real price data, with mock fallback

const HERMES_BASE = 'https://hermes.pyth.network';

// Pyth price feed IDs
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

// Mock price data for fallback
const MOCK_PRICES: Record<string, number> = {
  BTC: 67432.50,
  ETH: 3521.80,
  PYTH: 0.52,
  SOL: 142.35,
};

let useMock = false;
const resolvedFeedIds: Record<string, string> = { ...FEED_IDS };

function enableMockTemporarily() {
  if (useMock) return;
  console.warn('Pyth API failed, using mock data for 30s...');
  useMock = true;
  setTimeout(() => {
    console.log('Retrying live Pyth API...');
    useMock = false;
  }, 30_000);
}

export async function fetchPrice(asset: string): Promise<PriceData> {
  const feedId = await getFeedId(asset);
  if (!feedId) throw new Error(`Unknown asset: ${asset}`);

  if (useMock) {
    return getMockPrice(asset);
  }

  try {
    const res = await fetch(
      `${HERMES_BASE}/v2/updates/price/latest?ids[]=${feedId}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      enableMockTemporarily();
      return getMockPrice(asset);
    }

    const data = await res.json();
    const parsed = data.parsed?.[0];

    if (!parsed) {
      enableMockTemporarily();
      return getMockPrice(asset);
    }

    const priceData = parsed.price;
    const price = Number(priceData.price) * Math.pow(10, priceData.expo);
    const confidence = Number(priceData.conf) * Math.pow(10, priceData.expo);

    return {
      asset,
      price,
      confidence,
      timestamp: parsed.price.publish_time * 1000,
      expo: priceData.expo,
    };
  } catch (err) {
    console.warn('Pyth API error:', err);
    enableMockTemporarily();
    return getMockPrice(asset);
  }
}

async function getFeedId(asset: string): Promise<string | undefined> {
  if (resolvedFeedIds[asset]) return resolvedFeedIds[asset];

  try {
    const res = await fetch(
      `${HERMES_BASE}/v2/price_feeds?query=${encodeURIComponent(asset)}&asset_type=crypto`,
      { cache: 'force-cache' }
    );

    if (!res.ok) {
      return undefined;
    }

    const feeds = (await res.json()) as Array<{
      id?: string;
      attributes?: {
        base?: string;
        quote_currency?: string;
        symbol?: string;
      };
    }>;

    const exact = feeds.find((feed) => {
      const base = String(feed.attributes?.base ?? '').toUpperCase();
      const quote = String(feed.attributes?.quote_currency ?? '').toUpperCase();
      const symbol = String(feed.attributes?.symbol ?? '').toUpperCase();
      return feed.id && ((base === asset && quote === 'USD') || symbol === `${asset}/USD`);
    });

    if (exact?.id) {
      resolvedFeedIds[asset] = exact.id;
      return exact.id;
    }
  } catch (err) {
    console.warn(`Failed to resolve feed id for ${asset}:`, err);
  }

  return undefined;
}

function getMockPrice(asset: string): PriceData {
  const basePrice = MOCK_PRICES[asset] || 100;
  // Add slight random variation to simulate live price
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
