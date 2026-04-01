# Pyth Entropy v2 Slots Consumer

This folder contains the Solidity-side consumer contract and deployment scaffold for a future `Pyth Entropy v2` bridge used by `Volatility Slots`.

## Purpose

The current app is:
- Solana/Phantom for deposits and withdrawals
- Supabase/Postgres for app balance + round persistence
- Next.js for game runtime

`Pyth Entropy v2` is EVM-oriented, so the Slots integration needs a bridge architecture instead of a direct frontend call.

This contract is the **consumer-side skeleton** for that bridge.

## Current state

- `PythEntropySlotsConsumer.sol` now supports:
  - official Entropy consumer callback shape
  - default-provider `requestV2()` flow
  - `requestSlotsRandomness(...)`
  - `requestSlotsRandomnessWithCustomGas(...)`
- Foundry deployment scaffold is included in:
  - `foundry.toml`
  - `script/DeployEntropySlotsConsumer.s.sol`
- backend bridge worker is expected to read `EntropyRequested` and `EntropyFulfilled` events and sync them back into Supabase

## Base Sepolia values

These are the protocol-side values for Base Sepolia:

- `PYTH_ENTROPY_V2_CHAIN_ID=84532`
- `PYTH_ENTROPY_V2_ENTROPY_ADDRESS=0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`
- `PYTH_ENTROPY_V2_DEFAULT_PROVIDER=0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344`

You still need to provide:

- `PYTH_ENTROPY_V2_RPC_URL`
- `PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY`
- `PYTH_ENTROPY_V2_BRIDGE_SECRET`
- `PYTH_ENTROPY_V2_CONTRACT_ADDRESS` (after deployment)
- `PYTH_CASINO_APP_URL`

## Deployment flow

### 1. Install Foundry

If you do not already have it:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Install `forge-std`

From `contracts/entropy-consumer`:

```bash
git init
forge install foundry-rs/forge-std
```

### 3. Export deployment env values

```bash
export PYTH_ENTROPY_V2_RPC_URL="https://base-sepolia.g.alchemy.com/v2/..."
export PYTH_ENTROPY_V2_ENTROPY_ADDRESS="0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"
export PYTH_ENTROPY_V2_DEFAULT_PROVIDER="0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344"
export PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT="350000"
export PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY="0xyour_bridge_private_key"
```

Notes:
- the deploy script now accepts a normal hex private key in `PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY`
- the bridge wallet needs Base Sepolia ETH for deployment + request gas

### 4. Deploy to Base Sepolia

From `contracts/entropy-consumer`:

```bash
forge script script/DeployEntropySlotsConsumer.s.sol:DeployEntropySlotsConsumer \
  --rpc-url $PYTH_ENTROPY_V2_RPC_URL \
  --broadcast
```

### 5. Copy the deployed contract address

Set it in your app env:

```env
PYTH_ENTROPY_V2_CONTRACT_ADDRESS=0x...
```

### 6. Run the bridge worker

Back in the app root:

```bash
npm run entropy-bridge-worker
```

## Intended flow

1. Pyth Casino creates a pending `slot_randomness_requests` row in Supabase
2. Backend bridge submits an Entropy request through this contract
3. Contract emits `EntropyRequested`
4. Entropy fulfills randomness and calls back the consumer
5. Contract emits `EntropyFulfilled`
6. Backend watcher picks up fulfillment and finalizes the pending Slots round
7. Frontend poller resolves the pending UI into a finished spin result

## Status

This is a **deployment-ready scaffold**, not a fully verified production integration. The remaining work is:

- deploy the consumer contract on Base Sepolia
- run the bridge worker against Base Sepolia
- verify end-to-end Entropy fulfillment into the Slots page
