# API and Hook Reference

## Context Hooks

## `useMarketData(asset?)`
Source: `context/MarketDataContext.tsx`

### Params
- `asset` (optional): `'BTC' | 'ETH' | 'SOL'`

### Returns
- `assets`: map of all asset states
- `current`: selected asset state when `asset` is provided
- `sourceLabel`: UI-ready source text

### Asset State Fields
- `price`
- `previousPrice`
- `direction`
- `change15s`
- `volatility`
- `volatilityLevel`
- `mood`
- `dangerLevel`
- `ticks`
- `updatedAt`

## `useWallet()`
Source: `context/WalletContext.tsx`

### Returns
- `balance`
- `placeBet(amount): boolean`
- `addWinnings(amount): void`
- `resetBalance(): void`
- `totalBets`
- `totalWon`
- `gamesPlayed`

## `useSound()`
Source: `context/SoundContext.tsx`

### Returns
- `soundEnabled`
- `toggleSound()`
- `playCue(cue)`
- `unlockAudio()`

Cue union:
- `'click' | 'win' | 'lose' | 'liquidated' | 'jackpot'`

## `useGameProof(game)`
Source: `context/ProofContext.tsx`

### Params
- `game`: `'slots' | 'roulette' | 'liquidation'`

### Returns
- `latestProof`
- `proofHistory`
- `recordProof(inputWithoutGame)`

## Utility Modules

## `lib/pyth.ts`
- `fetchPrice(asset)`
- `fetchMultiplePrices(assets)`
- `formatPrice(price)`
- `getPriceChangePercent(startPrice, endPrice)`

Constants:
- `FEED_IDS`
- `ASSET_SYMBOLS`
- `ASSET_NAMES`

## `lib/volatility.ts`
- `calculateRollingVolatility(prices, window?)`
- `classifyVolatility(volatility)`
- `getMarketMood(changePercent)`
- `getSlotsVolatilityMultiplier(level)`
- `getRoulettePayoutMultiplier(level, basePayout?)`
- `getLiquidationDifficultyScalar(level)`
- `getDangerLevel(volatility)`

Types:
- `VolatilityLevel`
- `MarketMood`
- `DangerLevel`

## `lib/entropy.ts`
- `getRandomNumber(min, max)`
- `getRandomFloat()`
- `getSlotOutcome()`
- `calculateSlotPayout(symbols, betAmount, volatilityMultiplier?)`

Constants:
- `SLOT_SYMBOLS`
- `SYMBOL_WEIGHTS`
- `PAYOUT_TABLE`

## `lib/proof.ts`
- `getMovementPercent(startPrice, endPrice)`
- `createProofId()`
- `createRandomnessSeed()`
- `formatProofShareText(proof)`

Types:
- `ProofGame`
- `ProofResult`
- `GameProof`
- `NewProofInput`

## `lib/sound.ts`
- `soundEngine.setEnabled(enabled)`
- `soundEngine.unlock()`
- `soundEngine.playCue(cue)`

Behavior:
- Web Audio API tone synthesis
- muted unless explicitly enabled and unlocked by user interaction
