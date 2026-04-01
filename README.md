# Pyth Casino

Pyth Casino is a Next.js app where casino-style game outcomes are driven by live market behavior anchored to Pyth Hermes data.

It includes:
- Real-time market micro-stream (`BTC`, `ETH`, `PYTH`, `SOL`) with smooth client interpolation.
- Volatility-driven gameplay logic across all games.
- Proof of Outcome system that records verifiable round metadata.
- Privy authentication + embedded wallet identity.
- Phantom-powered native SOL deposit / withdrawal wallet rail backed by persistent Postgres balance storage.
- Wallet-linked persistent round history for roulette, slots, and liquidation.
- Lightweight Web Audio cues and high-visibility result overlays.
- Provider-based Slots randomness architecture with a local provider active today and Base Sepolia Entropy-ready scaffolding for later.
- Server-side Pyth RPC proxy for app-owned market reads.
- Zod-validated API inputs and origin checks for wallet auth and mutations.

## Live Features
- **Price Roulette**: bet up/down over a timed round with volatility-adjusted payout.
- **Volatility Slots**: entropy-based slot outcomes amplified by market volatility tier.
- **Liquidation Game**: survival game with dynamic difficulty tied to volatility/danger.
- **Market Pulse + Ticker**: live feed UI with movement, tier, and mood labels.
- **Proof Panel**: post-round verification card (`startPrice`, `endPrice`, `% move`, volatility, source, seed).

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript
- CSS Modules + global design tokens
- Privy (`@privy-io/react-auth`)
- Phantom wallet adapter + Solana Web3
- Supabase Postgres via `pg`
- Pyth Hermes REST price anchors
- Provider-based Slots randomness layer (`local` today, `pyth_entropy_v2` scaffolded for Base Sepolia)

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env.local
```
Then set:
- `NEXT_PUBLIC_APP_ORIGIN`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `DATABASE_URL`
- `NEXT_PUBLIC_TREASURY_WALLET_ADDRESS`
- `TREASURY_PRIVATE_KEY`
- optionally keep or change Slots randomness flags:
  - `SLOTS_RANDOMNESS_PROVIDER=local`
  - `NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=local`
  - for Base Sepolia Entropy bridge mode also set:
    - `PYTH_ENTROPY_V2_CONTRACT_ADDRESS`
    - `PYTH_ENTROPY_V2_CHAIN_ID`
    - `PYTH_ENTROPY_V2_RPC_URL`
    - `PYTH_ENTROPY_V2_ENTROPY_ADDRESS`
    - `PYTH_ENTROPY_V2_DEFAULT_PROVIDER`
    - `PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY`
    - `PYTH_ENTROPY_V2_BRIDGE_SECRET`
    - `PYTH_CASINO_APP_URL`

3. Start development server:
```bash
npm run dev
```

4. Open:
`http://localhost:3000`

## Scripts
- `npm run dev`: run local dev server
- `npm run lint`: run ESLint
- `npm run build`: production build validation
- `npm run start`: run production server
- `npm run security:check-html`: fail if unsafe HTML rendering APIs appear
- `npm run entropy-bridge-worker`: watch Entropy requests, submit consumer calls, and settle fulfilled slot spins

## Project Structure
```text
app/                 App Router pages (lobby + game routes)
components/          Reusable UI (navbar, overlays, proof panel, pulse, etc.)
context/             Global state providers (market, wallet, sound, proof)
lib/                 Core logic (Pyth API, volatility, entropy, proof, sound)
```

## Documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
- [docs/GAME_LOGIC.md](./docs/GAME_LOGIC.md)
- [docs/API_REFERENCE.md](./docs/API_REFERENCE.md)

## Notes
- The market stream is client-side simulated between Hermes anchor fetches for responsiveness.
- Phantom deposits and withdrawals use native SOL, while game betting still runs against the app's persisted casino ledger.
- If Hermes is unavailable, the app falls back to mock prices to keep gameplay functional.
- Runtime wallet balances now require a real Postgres database; the app no longer silently uses an in-memory fallback.
- Slots randomness now resolves through a provider layer. `local` is the secure default; `pyth_entropy_v2` is feature-gated for Base Sepolia and should stay disabled until the bridge is production-ready.
- The Entropy bridge worker lives in `scripts/entropy-bridge-worker.ts` and expects a deployed EVM consumer contract plus the bridge env values above.
