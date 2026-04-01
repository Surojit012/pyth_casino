# Pyth Roulette (Anchor Program)

Minimal on-chain `Price Roulette` program for Solana devnet.

## Instructions
- `place_bet(bet_id, amount_lamports, direction)`
- `resolve_bet(bet_id)`

## Accounts
- `Bet`
  - `player`
  - `amount_lamports`
  - `direction` (`0=up`, `1=down`)
  - `entry_price`
  - `resolved`
  - plus demo metadata (`won`, timestamps, exit price)
- `Vault`
  - Program-owned escrow PDA (`seeds = ["vault"]`)

## Escrow Model
- `place_bet` transfers user SOL into vault PDA.
- `resolve_bet` reads latest Pyth BTC price.
- If win, program attempts a `2x` payout from vault escrow.

## Pyth Integration
- Pass BTC/USD Pyth price account in both instructions as `pyth_btc_price`.
- Program validates and reads it via `pyth-sdk-solana`.

## Frontend Env Vars
Set these in `.env.local`:
- `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com`
- `NEXT_PUBLIC_ROULETTE_PROGRAM_ID=<deployed program id>`
- `NEXT_PUBLIC_PYTH_BTC_FEED_ACCOUNT=<btc/usd feed account pubkey>`
