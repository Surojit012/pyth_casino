import { NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL, PublicKey, type ParsedInstruction, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { DatabaseConnectionError, db, normalizeDatabaseError } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';
import { getRequiredServerTokenEnv } from '@/lib/solanaToken';
import { assertTrustedOrigin } from '@/lib/security';
import { depositBodySchema, parseJsonBody, validationErrorResponse } from '@/lib/validation';

export const runtime = 'nodejs';

function hasWalletSigner(tx: ParsedTransactionWithMeta, walletAddress: string) {
  return tx.transaction.message.accountKeys.some((key) => {
    if (typeof key === 'string') return key === walletAddress;
    return key.pubkey.toBase58() === walletAddress && key.signer;
  });
}

function extractSolDepositAmount(
  tx: ParsedTransactionWithMeta,
  walletAddress: string,
  treasuryWallet: string
) {
  const topLevel = tx.transaction.message.instructions;
  const inner = tx.meta?.innerInstructions?.flatMap((item) => item.instructions) ?? [];
  const allInstructions = [...topLevel, ...inner];

  for (const instruction of allInstructions) {
    if (!('parsed' in instruction)) continue;
    const parsedIx = instruction as ParsedInstruction;
    if (parsedIx.program !== 'system') continue;

    const parsed = parsedIx.parsed as { type?: string; info?: Record<string, unknown> };
    if (parsed?.type !== 'transfer') continue;

    const source = String(parsed.info?.source ?? '');
    const destination = String(parsed.info?.destination ?? '');
    const lamports = Number(parsed.info?.lamports ?? 0);
    if (source !== walletAddress || destination !== treasuryWallet || lamports <= 0) continue;

    return lamports / LAMPORTS_PER_SOL;
  }

  return 0;
}

export async function POST(request: Request) {
  let walletAddress: string;
  try {
    walletAddress = getWalletFromRequest(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    assertTrustedOrigin(request);
  } catch (error) {
    return validationErrorResponse(error);
  }
  let txSignature: string;
  try {
    ({ txSignature } = await parseJsonBody(request, depositBodySchema));
  } catch (error) {
    return validationErrorResponse(error);
  }

  try {
    const { rpcUrl, treasuryWallet, networkLabel } = getRequiredServerTokenEnv();
    const connection = new Connection(rpcUrl, 'confirmed');
    await connection.confirmTransaction(txSignature, 'confirmed');
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) {
      return NextResponse.json(
        { error: `Transaction not found on ${networkLabel}` },
        { status: 400 }
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { error: 'Transaction failed on-chain and cannot be used for deposit credit' },
        { status: 400 }
      );
    }

    if (!hasWalletSigner(tx, walletAddress)) {
      return NextResponse.json(
        { error: 'Transaction signer does not match authenticated wallet' },
        { status: 400 }
      );
    }

    const depositedAmount = extractSolDepositAmount(tx, walletAddress, treasuryWallet);
    if (depositedAmount <= 0) {
      return NextResponse.json(
        { error: 'No valid SOL transfer to the treasury wallet was found in this transaction' },
        { status: 400 }
      );
    }

    const client = await db.connect().catch((error: unknown) => {
      throw normalizeDatabaseError(error);
    });
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO casino_users (wallet_address, balance)
         VALUES ($1, 0)
         ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
         RETURNING id`,
        [walletAddress]
      );
      const userId = userResult.rows[0].id as string;

      const insertTxResult = await client.query(
        `INSERT INTO casino_transactions (user_id, type, amount, tx_signature, status)
         VALUES ($1, 'deposit', $2, $3, 'confirmed')
         ON CONFLICT (tx_signature) DO NOTHING
         RETURNING id`,
        [userId, depositedAmount, txSignature]
      );

      if (insertTxResult.rowCount === 0) {
        await client.query('ROLLBACK');
        const balanceResult = await db.query(
          `SELECT balance FROM casino_users WHERE wallet_address = $1`,
          [walletAddress]
        );
        return NextResponse.json({
          newBalance: Number(balanceResult.rows[0]?.balance ?? 0),
          depositedAmount: 0,
          duplicate: true,
        });
      }

      const balanceUpdate = await client.query(
        `UPDATE casino_users
         SET balance = balance + $1
         WHERE wallet_address = $2
         RETURNING balance`,
        [depositedAmount, walletAddress]
      );

      await client.query('COMMIT');
      return NextResponse.json({
        newBalance: Number(balanceUpdate.rows[0]?.balance ?? 0),
        depositedAmount,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      return NextResponse.json(
        {
          error: 'Persistent storage unavailable',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Deposit verification failed',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
