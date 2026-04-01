# Railway Deployment Guide

## Environment Variables Required

Your Railway deployment is failing because environment variables are not configured. You need to set these in the Railway dashboard for each service.

### Required for All Services

```bash
# Database (Supabase/Postgres)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?sslmode=require

# Solana Configuration
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ROULETTE_PROGRAM_ID=9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN
NEXT_PUBLIC_TREASURY_WALLET_ADDRESS=<your-treasury-wallet>
TREASURY_PRIVATE_KEY=<your-treasury-private-key>

# Authentication
JWT_SECRET=<generate-random-secret>
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>

# Slots Configuration
SLOTS_RANDOMNESS_PROVIDER=local
NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=local
```

### Additional for Worker Service (entropy-bridge-worker)

If using Pyth Entropy V2 for randomness:

```bash
PYTH_ENTROPY_V2_CONTRACT_ADDRESS=<your-contract-address>
PYTH_ENTROPY_V2_CHAIN_ID=84532
PYTH_ENTROPY_V2_RPC_URL=https://sepolia.base.org
PYTH_ENTROPY_V2_ENTROPY_ADDRESS=0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c
PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY=<your-bridge-private-key>
PYTH_ENTROPY_V2_BRIDGE_SECRET=<your-bridge-secret>
PYTH_CASINO_APP_URL=https://your-app.railway.app
```

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on the service (web or worker)
3. Go to the "Variables" tab
4. Add each environment variable with its value
5. Railway will automatically redeploy when you save

## Service Configuration

### Web Service (Next.js)
- **Start Command**: `npm run start` (uses standalone server)
- **Build Command**: `npm run build` (already configured in package.json)
- **Required**: Always needed

### Worker Service (entropy-bridge-worker)
- **Start Command**: `npm run entropy-bridge-worker`
- **Required**: ONLY if using `SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2`
- **NOT NEEDED**: If using `SLOTS_RANDOMNESS_PROVIDER=local` (default)

## Important: Do You Need the Worker?

The worker service is **ONLY** required if you're using Pyth Entropy V2 for randomness generation.

**If you're using local randomness (default):**
- ✅ Keep the web service running
- ❌ **DELETE or PAUSE the worker service in Railway**
- Set `SLOTS_RANDOMNESS_PROVIDER=local` in environment variables

**If you're using Pyth Entropy V2:**
- ✅ Keep both web and worker services running
- ✅ Set `SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2`
- ✅ Provide all Pyth Entropy V2 environment variables

## Current Error

Your worker is crashing with:
```
Error: Missing required env: PYTH_ENTROPY_V2_CONTRACT_ADDRESS
```

**This means one of two things:**

1. **You're using local randomness** (most likely): The worker service shouldn't be running at all. Delete or pause it in Railway.

2. **You want to use Pyth Entropy V2**: You need to add all the Pyth Entropy V2 environment variables listed above.

## Quick Fix

**For Local Randomness (Recommended for most users):**

1. Open Railway dashboard
2. Go to the "worker" service
3. Click the service settings (three dots menu)
4. Select "Remove Service" or "Pause"
5. Keep only the web service running
6. Make sure web service has these variables:
   - `SLOTS_RANDOMNESS_PROVIDER=local`
   - `NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=local`
   - `DATABASE_URL=<your-database-url>`
   - All other required variables from the list above

**For Pyth Entropy V2 (Advanced):**

1. Keep both web and worker services
2. Add ALL Pyth Entropy V2 variables to BOTH services:
   - `PYTH_ENTROPY_V2_CONTRACT_ADDRESS`
   - `PYTH_ENTROPY_V2_CHAIN_ID`
   - `PYTH_ENTROPY_V2_RPC_URL`
   - `PYTH_ENTROPY_V2_ENTROPY_ADDRESS`
   - `PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY`
   - `PYTH_ENTROPY_V2_BRIDGE_SECRET`
   - `SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2`
   - `NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2`

## Reference

See `.env.example` in the repository for all available configuration options.
