# Game Logic Reference

This file summarizes how outcomes and payouts are computed for each game.

## Shared Inputs

From `useMarketData`:
- `price`
- `change15s`
- `volatility` and `volatilityLevel`
- `mood`
- `dangerLevel`

From `useWallet`:
- `placeBet(amount)`
- `addWinnings(amount)`

## Roulette

File: `app/roulette/page.tsx`

### Flow
1. Player selects asset, direction, and stake.
2. Round starts with locked `startPrice`.
3. Countdown runs (`30s`).
4. End price is read from latest market stream value.
5. Result:
   - Win if direction matches movement.
   - Loss otherwise.

### Payout
- Base multiplier: `1.9x`
- Volatility boost:
  - LOW: `1.90x`
  - MEDIUM: `2.10x`
  - HIGH: `2.35x`

## Slots

File: `app/slots/page.tsx`

### Flow
1. Player sets stake.
2. Spin outcome generated from weighted symbol entropy.
3. Base symbol payout is multiplied by current volatility tier multiplier.
4. Overlay + history + proof are shown.

### Symbol Payout
Defined in `lib/entropy.ts`:
- `btc-btc-btc`: `50x`
- `eth-eth-eth`: `25x`
- `slot-slot-slot`: `20x`
- `sol-sol-sol`: `15x`
- `diamond-diamond-diamond`: `10x`
- `rocket-rocket-rocket`: `8x`
- `fire-fire-fire`: `5x`
- `lightning-lightning-lightning`: `3x`
- any pair: `1.5x`

### Volatility Multiplier
Defined in `lib/volatility.ts`:
- LOW: `1.00x`
- MEDIUM: `1.35x`
- HIGH: `1.85x`

Final payout:
`betAmount * baseSymbolMultiplier * volatilityMultiplier`

## Liquidation Game

File: `app/liquidation/page.tsx`

### Flow
1. Player chooses long/short, leverage, stake.
2. Position starts from entry price.
3. Simulated loop updates price every `500ms`.
4. PnL scales with leverage.
5. Player either:
   - cashes out manually, or
   - gets liquidated at `-100%` leveraged PnL.

### Dynamic Difficulty
- Uses volatility tier to scale simulation pressure:
  - LOW: `1.0`
  - MEDIUM: `1.35`
  - HIGH: `1.8`
- Applies danger drift from `SAFE/WATCH/DANGER/CRITICAL`.

## Market Mood Labels

Defined in `lib/volatility.ts` using 15s absolute move:
- `< 0.35%`: `Market Calm`
- `< 1.2%`: `Market Volatile`
- `>= 1.2%`: `Market Insane`

## Proof of Outcome

Each resolved round records:
- `startPrice`
- `endPrice`
- `timestamp`
- `asset`
- `volatilityLevel`
- `result`
- `randomnessSeed` (slots)
- `dataSource`

Rendered via `components/ProofPanel.tsx` and share-formatted by `formatProofShareText`.
