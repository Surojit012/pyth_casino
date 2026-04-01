export const HERMES_BASE_URL = 'https://hermes.pyth.network';

export function buildHermesLatestUrl(feedIds: string[]) {
  const search = new URLSearchParams();
  for (const feedId of feedIds) {
    search.append('ids[]', feedId);
  }
  return `${HERMES_BASE_URL}/v2/updates/price/latest?${search.toString()}`;
}

export function buildHermesSearchUrl(query: string, assetType = 'crypto') {
  const search = new URLSearchParams({
    query,
    asset_type: assetType,
  });
  return `${HERMES_BASE_URL}/v2/price_feeds?${search.toString()}`;
}
