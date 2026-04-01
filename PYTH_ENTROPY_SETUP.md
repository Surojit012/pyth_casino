# Pyth Entropy V2 Setup Guide

## Overview

Pyth Entropy V2 provides verifiable randomness for your slots game. It runs on Base Sepolia testnet and requires deploying a smart contract and running a bridge worker.

## Required Environment Variables

You need to set these in Railway for BOTH the web and worker services:

### 1. Database
```bash
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?sslmode=require
```
Get this from your Supabase project settings.

### 2. Randomness Provider Configuration
```bash
SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2
NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2
```

### 3. Pyth Entropy V2 Contract (YOU NEED TO DEPLOY THIS)
```bash
PYTH_ENTROPY_V2_CONTRACT_ADDRESS=0x...
```
This is YOUR deployed EntropySlotsConsumer contract address on Base Sepolia.

**How to get it:**
1. You need to deploy the contract in `contracts/entropy-consumer/`
2. See deployment instructions below

### 4. Base Sepolia Network Configuration
```bash
PYTH_ENTROPY_V2_CHAIN_ID=84532
PYTH_ENTROPY_V2_RPC_URL=https://sepolia.base.org
```
These are fixed for Base Sepolia testnet.

### 5. Pyth Entropy Contract Address (FIXED)
```bash
PYTH_ENTROPY_V2_ENTROPY_ADDRESS=0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c
```
This is the official Pyth Entropy contract on Base Sepolia.

### 6. Bridge Wallet (YOU NEED TO CREATE THIS)
```bash
PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY=0x...
PYTH_ENTROPY_V2_BRIDGE_SECRET=your-random-secret-string
```

**How to get these:**
- Create a new Ethereum wallet (use MetaMask or generate with a script)
- Export the private key (must start with 0x)
- Fund it with Base Sepolia ETH (get from faucet)
- Generate a random secret string for BRIDGE_SECRET

### 7. App URL
```bash
PYTH_CASINO_APP_URL=https://your-app.railway.app
```
Your Railway web service URL.

### 8. Other Required Variables
```bash
# Solana Configuration
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ROULETTE_PROGRAM_ID=9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN
NEXT_PUBLIC_TREASURY_WALLET_ADDRESS=<your-treasury-wallet>
TREASURY_PRIVATE_KEY=<your-treasury-private-key>

# Authentication
JWT_SECRET=<generate-random-secret>
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
```

## Step-by-Step Setup

### Step 1: Deploy the Entropy Consumer Contract

Navigate to the contracts directory:
```bash
cd contracts/entropy-consumer
```

Install dependencies:
```bash
npm install
```

Set up your `.env` file in `contracts/entropy-consumer/`:
```bash
PRIVATE_KEY=0x...  # Your deployer wallet private key (needs Base Sepolia ETH)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Deploy the contract:
```bash
npx hardhat run scripts/DeployEntropySlotsConsumer.s.sol --network baseSepolia
```

Copy the deployed contract address - this is your `PYTH_ENTROPY_V2_CONTRACT_ADDRESS`.

### Step 2: Create Bridge Wallet

Generate a new wallet for the bridge:
```bash
# Using Node.js
node -e "const { Wallet } = require('ethers'); const w = Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey);"
```

Or use MetaMask:
1. Create a new account
2. Export the private key
3. Copy the address

Fund it with Base Sepolia ETH:
- Visit https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Or https://faucet.quicknode.com/base/sepolia

### Step 3: Generate Bridge Secret

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Configure Railway Environment Variables

In Railway dashboard, for BOTH web and worker services, add:

```bash
# Database
DATABASE_URL=postgresql://...

# Randomness Provider
SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2
NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2

# Your Deployed Contract
PYTH_ENTROPY_V2_CONTRACT_ADDRESS=0x...  # From Step 1

# Network Config
PYTH_ENTROPY_V2_CHAIN_ID=84532
PYTH_ENTROPY_V2_RPC_URL=https://sepolia.base.org

# Pyth Entropy Contract (Fixed)
PYTH_ENTROPY_V2_ENTROPY_ADDRESS=0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c

# Bridge Wallet (From Step 2)
PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY=0x...
PYTH_ENTROPY_V2_BRIDGE_SECRET=...  # From Step 3

# App URL
PYTH_CASINO_APP_URL=https://your-app.railway.app

# Other required variables
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ROULETTE_PROGRAM_ID=9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN
NEXT_PUBLIC_TREASURY_WALLET_ADDRESS=...
TREASURY_PRIVATE_KEY=...
JWT_SECRET=...
NEXT_PUBLIC_PRIVY_APP_ID=...
```

### Step 5: Deploy

Railway will automatically redeploy both services once you save the environment variables.

## How It Works

1. User plays slots on your web app
2. Web app requests randomness from your EntropySlotsConsumer contract on Base Sepolia
3. Contract requests randomness from Pyth Entropy
4. Bridge worker monitors for randomness requests
5. When Pyth provides randomness, worker fulfills the request
6. Web app receives the random result and shows slot outcome

## Troubleshooting

### Worker keeps crashing with "Missing required env"
- Make sure ALL environment variables are set in Railway
- Check that variable names are exactly correct (case-sensitive)
- Verify the contract address starts with 0x

### Contract deployment fails
- Make sure your deployer wallet has Base Sepolia ETH
- Check that RPC URL is correct: https://sepolia.base.org
- Verify your private key starts with 0x

### Bridge wallet runs out of gas
- The bridge wallet needs ETH to fulfill randomness requests
- Monitor the balance and refill from faucet when needed
- Each fulfillment costs ~0.001 ETH

### Randomness requests timeout
- Check that the bridge worker is running in Railway
- Verify the worker has the correct contract address
- Check worker logs for errors

## Cost Estimate

- Contract deployment: ~0.01 ETH (one-time)
- Per randomness request: ~0.001 ETH
- Bridge wallet should have at least 0.1 ETH for testing

All on Base Sepolia testnet (free ETH from faucets).

## Security Notes

- Keep your private keys secure
- Never commit private keys to git
- Use different wallets for deployer, bridge, and treasury
- The bridge secret should be a strong random string
- In production, use a secure key management system

## Reference

- Pyth Entropy Docs: https://docs.pyth.network/entropy
- Base Sepolia Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Base Sepolia Explorer: https://sepolia.basescan.org/
