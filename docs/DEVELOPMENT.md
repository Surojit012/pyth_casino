# Development Guide

## Prerequisites
- Node.js 20+
- npm 10+

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env.local
```
3. Set values:
- `NEXT_PUBLIC_PRIVY_APP_ID`: Privy app ID used by `PrivyProvider`.
- `DATABASE_URL`: real Postgres connection string for Supabase or another hosted Postgres instance.
- `NEXT_PUBLIC_TREASURY_WALLET_ADDRESS` and `TREASURY_PRIVATE_KEY`: native SOL treasury for deposit/withdraw flows.

4. Run app:
```bash
npm run dev
```

## Build and Quality Checks
- Lint:
```bash
npm run lint
```
- Production build:
```bash
npm run build
```

Run both before merging.

## Common Dev Workflows

### Add a new market-aware UI widget
1. Use `useMarketData(asset?)`.
2. Read `price`, `direction`, `change15s`, `volatilityLevel`, `mood`.
3. Reuse existing flash/micro animation styles for consistency.

### Add a new game mechanic
1. Keep game-local state in page component.
2. Use `useWallet()` for bets/payout accounting.
3. Use `useSound()` for optional cues.
4. Record verifiable result via `useGameProof(game).recordProof(...)`.

### Extend proof metadata
1. Update `GameProof` and `NewProofInput` in `lib/proof.ts`.
2. Update `ProofPanel` rendering in `components/ProofPanel.tsx`.
3. Update each game page proof recording payload.

## Environment and Fallback Behavior
- Market anchors use Hermes REST.
- On fetch failure, price functions can fall back to mock prices.
- Wallet deposits and withdrawals use native SOL with Phantom.
- Casino balances are persisted in Postgres and read back from the server wallet ledger.
- The app no longer silently falls back to `pg-mem` at runtime if `DATABASE_URL` is missing or broken.

## Code Organization Rules
- `context/`: shared cross-route state and hooks
- `lib/`: deterministic logic and utility modules
- `components/`: display-focused reusable units
- `app/`: route-level orchestration and user flows

## Known Constraints
- No backend or websocket service (stream is client-side simulated between anchor fetches).
- No automated test suite yet; verification is currently lint + build + manual gameplay checks.
- Betting still uses an in-app casino ledger even though deposits/withdrawals happen on-chain with native SOL.
