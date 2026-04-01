-- Cleanup script for stuck Pyth Entropy v2 randomness requests
-- Run this in your Supabase SQL Editor or psql

-- First, let's see what we're dealing with
SELECT 
  request_id,
  wallet_address,
  bet_amount,
  status,
  created_at,
  metadata->>'sequenceNumber' as sequence_number,
  error_message
FROM slot_randomness_requests
WHERE provider = 'pyth_entropy_v2'
  AND status = 'pending'
  AND created_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at ASC;

-- If you see stuck requests above, run this to clean them up:
UPDATE slot_randomness_requests
SET 
  status = 'failed',
  error_message = 'Request timed out - cleaned up by maintenance script',
  updated_at = NOW()
WHERE provider = 'pyth_entropy_v2'
  AND status = 'pending'
  AND created_at < NOW() - INTERVAL '5 minutes';

-- Verify cleanup
SELECT 
  status,
  COUNT(*) as count
FROM slot_randomness_requests
WHERE provider = 'pyth_entropy_v2'
GROUP BY status;
