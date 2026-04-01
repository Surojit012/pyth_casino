# Vercel Deployment Guide

## Overview

This guide covers deploying the Pyth Casino web application to Vercel. The worker service should remain on Railway.

## Architecture

- **Vercel**: Hosts the Next.js web application (frontend + API routes)
- **Railway**: Hosts the entropy-bridge-worker (background service)
- **Supabase**: Hosts the PostgreSQL database (shared by both)

## Prerequisites

1. GitHub repository with your code
2. Vercel account connected to your GitHub
3. All environment variables ready (see below)
4. Railway worker service already deployed and running

## Required Environment Variables

Add these in Vercel Project Settings → Environment Variables:

### Database
```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?sslmode=require
```

### Randomness Provider
```
SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2
NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER=pyth_entropy_v2
```

### Pyth Entropy V2 Configuration
```
PYTH_ENTROPY_V2_CONTRACT_ADDRESS=<your-deployed-contract-address>
PYTH_ENTROPY_V2_CHAIN_ID=84532
PYTH_ENTROPY_V2_RPC_URL=https://sepolia.base.org
PYTH_ENTROPY_V2_ENTROPY_ADDRESS=0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c
PYTH_ENTROPY_V2_DEFAULT_PROVIDER=0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344
PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT=350000
```

### Bridge Configuration (Same as Railway)
```
PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY=<your-bridge-wallet-private-key>
PYTH_ENTROPY_V2_BRIDGE_SECRET=<your-bridge-secret>
```

### App URL
```
PYTH_CASINO_APP_URL=https://your-app.vercel.app
```
(Update this after first deployment with your actual Vercel URL)

### Solana Configuration
```
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ROULETTE_PROGRAM_ID=9C2rBMBfZXDpPXtMdMiKs6cGjZjHujDEoVKmie6KRLJN
NEXT_PUBLIC_TREASURY_WALLET_ADDRESS=<your-treasury-wallet-address>
TREASURY_PRIVATE_KEY=<your-treasury-private-key>
```

### Authentication
```
JWT_SECRET=<your-jwt-secret>
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
```

### Optional (Legacy Token Tooling)
```
NEXT_PUBLIC_TOKEN_MINT_ADDRESS=<if-using-legacy-scripts>
NEXT_PUBLIC_TOKEN_AUTHORITY_ADDRESS=<if-using-legacy-scripts>
```

## Deployment Steps

### Step 1: Import Project to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect Next.js configuration

### Step 2: Configure Build Settings

Vercel should auto-detect these, but verify:

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next` (auto-detected)
- **Install Command**: `npm install`
- **Node Version**: 22.x (set in package.json engines)

### Step 3: Add Environment Variables

1. Go to Project Settings → Environment Variables
2. Add all variables listed above
3. Set them for: Production, Preview, and Development environments
4. Click "Save"

### Step 4: Deploy

1. Click "Deploy"
2. Vercel will build and deploy your application
3. Wait for deployment to complete (~2-3 minutes)

### Step 5: Update App URL

After first deployment:
1. Copy your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Update `PYTH_CASINO_APP_URL` environment variable in Vercel
3. Also update it in Railway worker service
4. Redeploy both services

## Troubleshooting

### Build fails with "@types/react-dom" error

This is usually a cache issue. Try:

1. **Clear Vercel build cache**:
   - Go to Project Settings → General
   - Scroll to "Build & Development Settings"
   - Click "Clear Cache"
   - Redeploy

2. **Force reinstall dependencies**:
   - The `prebuild` script in package.json runs `npm install --no-audit`
   - This should ensure fresh installs

3. **Check package.json**:
   - Verify `@types/react-dom` is in devDependencies
   - Current version: `^19.2.3`

### Build fails with "DATABASE_URL is not configured"

This should NOT happen anymore because we fixed `lib/db.ts` to use lazy initialization. If it still occurs:

1. Verify `DATABASE_URL` is set in Vercel environment variables
2. Check that it's set for the correct environment (Production/Preview/Development)
3. Try redeploying

### API routes return 500 errors

1. Check Vercel Function Logs in the dashboard
2. Verify all environment variables are set correctly
3. Ensure database connection string is correct
4. Check that Railway worker is running

### Slots game doesn't work

1. Verify Railway worker service is running
2. Check that both Vercel and Railway have the same:
   - `PYTH_ENTROPY_V2_CONTRACT_ADDRESS`
   - `PYTH_ENTROPY_V2_BRIDGE_SECRET`
   - `DATABASE_URL`
3. Check worker logs in Railway for errors

### Wallet connection fails

1. Verify `NEXT_PUBLIC_PRIVY_APP_ID` is set
2. Check that `JWT_SECRET` is set
3. Ensure `NEXT_PUBLIC_SOLANA_RPC_URL` is accessible

## Environment Variable Checklist

Use this checklist to ensure all variables are set:

- [ ] DATABASE_URL
- [ ] SLOTS_RANDOMNESS_PROVIDER
- [ ] NEXT_PUBLIC_SLOTS_RANDOMNESS_PROVIDER
- [ ] PYTH_ENTROPY_V2_CONTRACT_ADDRESS
- [ ] PYTH_ENTROPY_V2_CHAIN_ID
- [ ] PYTH_ENTROPY_V2_RPC_URL
- [ ] PYTH_ENTROPY_V2_ENTROPY_ADDRESS
- [ ] PYTH_ENTROPY_V2_DEFAULT_PROVIDER
- [ ] PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT
- [ ] PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY
- [ ] PYTH_ENTROPY_V2_BRIDGE_SECRET
- [ ] PYTH_CASINO_APP_URL
- [ ] NEXT_PUBLIC_SOLANA_RPC_URL
- [ ] NEXT_PUBLIC_ROULETTE_PROGRAM_ID
- [ ] NEXT_PUBLIC_TREASURY_WALLET_ADDRESS
- [ ] TREASURY_PRIVATE_KEY
- [ ] JWT_SECRET
- [ ] NEXT_PUBLIC_PRIVY_APP_ID

## Post-Deployment

### Update Railway Worker

After Vercel deployment, update Railway worker's `PYTH_CASINO_APP_URL`:
```
PYTH_CASINO_APP_URL=https://your-app.vercel.app
```

### Test the Application

1. Visit your Vercel URL
2. Connect Phantom wallet
3. Try depositing SOL
4. Play slots game
5. Check that randomness is fulfilled (watch Railway worker logs)
6. Try withdrawing SOL

### Monitor

- **Vercel**: Check Function Logs for API errors
- **Railway**: Check worker logs for fulfillment activity
- **Supabase**: Monitor database connections and queries

## Differences from Railway

| Feature | Railway | Vercel |
|---------|---------|--------|
| Hosting | Full Node.js server | Serverless functions |
| Worker | Can run background processes | Cannot run workers |
| Build | Docker-based | Native Next.js |
| Logs | Real-time streaming | Function logs per request |
| Cost | Pay for uptime | Pay per invocation |

## Best Practices

1. **Use the same environment variables** in both Vercel and Railway
2. **Keep secrets secure** - never commit them to git
3. **Monitor both services** - they work together
4. **Test after deployment** - verify all features work
5. **Update PYTH_CASINO_APP_URL** in both places after deployment

## Cost Estimate

Vercel Free Tier includes:
- 100 GB bandwidth
- 100 GB-hours serverless function execution
- Unlimited deployments

This should be sufficient for testing and small-scale production.

## Support

- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs
- Pyth Entropy: https://docs.pyth.network/entropy

