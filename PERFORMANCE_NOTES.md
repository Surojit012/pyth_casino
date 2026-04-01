# Performance Optimization Notes

## Current Status

✅ Slots game is working with Pyth Entropy v2
⚠️ Initial response time: ~5 minutes (too slow)

## Performance Bottlenecks

The 5-minute delay is caused by several factors:

### 1. Pyth Entropy Reveal Time
- Pyth Network needs time to generate and reveal randomness
- This is external and cannot be optimized by us
- Typical time: 30-60 seconds on Base Sepolia testnet

### 2. Worker Polling Interval
- **Before**: 8 seconds between checks
- **After**: 3 seconds between checks
- **Impact**: Reduces detection latency by up to 5 seconds

### 3. Block Scanning Range
- **Before**: Scanned 250 blocks back on each cycle
- **After**: Scans 50 blocks back
- **Impact**: Faster log processing, less RPC load

### 4. Block Chunk Size
- **Before**: Processed 250 blocks per chunk
- **After**: Processes 100 blocks per chunk
- **Impact**: More frequent state updates, faster detection

## Expected Improvements

With these optimizations:
- **Best case**: 30-45 seconds (Pyth reveal time + minimal worker latency)
- **Typical case**: 45-90 seconds
- **Worst case**: 2-3 minutes (if Pyth is slow or network congestion)

## Monitoring Performance

The worker now logs timing information:

```
[bridge] submitting <requestId>...
[bridge] submitted <requestId> -> sequence <number> tx <hash> (1234ms)
[bridge] fulfilled <requestId> from entropy reveal sequence <number> (567ms)
```

Watch Railway logs to see:
- Submission time (should be 1-3 seconds)
- Time between submission and fulfillment (Pyth reveal time)
- Fulfillment API call time (should be <1 second)

## Further Optimizations (If Needed)

If response time is still too slow after these changes:

### 1. Reduce Polling Interval Further
```typescript
const LOOP_INTERVAL_MS = 2_000; // Poll every 2 seconds
```
⚠️ Trade-off: More RPC calls, higher costs

### 2. Use WebSocket Instead of Polling
- Subscribe to blockchain events in real-time
- Eliminates polling delay entirely
- More complex implementation

### 3. Optimize RPC Provider
- Use a faster RPC endpoint (Alchemy, Infura, QuickNode)
- Current: Public Base Sepolia RPC
- Paid providers have better performance

### 4. Parallel Block Scanning
- Scan multiple block ranges simultaneously
- Requires careful state management

### 5. Add Request Timeout
- Automatically fail requests that take too long
- Prevents users from waiting indefinitely
- Suggested timeout: 3-5 minutes

## Testing After Deployment

1. **Clear old stuck requests** (run cleanup script)
2. **Restart Railway worker** (to pick up new code)
3. **Try a fresh slots spin**
4. **Monitor Railway logs** for timing information
5. **Measure end-to-end time** from spin to result

## Cleanup Scripts

Two scripts are provided to clean up stuck requests:

### SQL Script (Recommended)
```bash
# Run in Supabase SQL Editor
cat cleanup-stuck-requests.sql
```

### TypeScript Script
```bash
tsx scripts/cleanup-stuck-requests.ts
```

Both scripts mark pending requests older than 5 minutes as failed.

## Architecture Notes

The current architecture uses polling, which has inherent latency:

```
User clicks spin
  ↓
Vercel creates DB request (instant)
  ↓
Railway worker polls DB (0-3s delay)
  ↓
Worker submits to blockchain (1-3s)
  ↓
Pyth generates randomness (30-60s)
  ↓
Pyth reveals randomness on-chain (5-10s)
  ↓
Railway worker polls for events (0-3s delay)
  ↓
Worker calls Vercel fulfill API (<1s)
  ↓
User sees result
```

**Total time**: 36-80 seconds in optimal conditions

## Production Recommendations

For production deployment:

1. **Use a paid RPC provider** (Alchemy, Infura, QuickNode)
2. **Consider WebSocket subscriptions** for real-time events
3. **Add request timeout** (3-5 minutes)
4. **Monitor worker health** (uptime, error rate)
5. **Set up alerts** for stuck requests
6. **Consider caching** frequently requested data
7. **Add retry logic** for failed fulfillments

## Cost Considerations

Current setup (Base Sepolia testnet):
- RPC calls: Free (public endpoint)
- Entropy fee: ~0.001 ETH per request (testnet)
- Worker compute: Railway free tier

Production (Base mainnet):
- RPC calls: $0.10-0.50 per 1M requests
- Entropy fee: ~$0.10-0.50 per request (real ETH)
- Worker compute: ~$5-10/month

## Support

If you continue to experience slow response times:
1. Check Railway worker logs for errors
2. Verify RPC endpoint is responding quickly
3. Check Pyth Network status
4. Consider the optimizations listed above

