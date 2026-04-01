import { NextResponse } from 'next/server';
import bs58 from 'bs58';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { DatabaseConnectionError, db, normalizeDatabaseError } from '@/lib/db';
import { getWalletFromRequest } from '@/lib/auth';
import { getRequiredServerTokenEnv } from '@/lib/solanaToken';

export const runtime = 'nodejs';

type WithdrawBody = {
  amount: number;
};

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

  let body: WithdrawBody;
  try {
    body = (await request.json()) as WithdrawBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const client = await db.connect().catch((error) => {
    throw normalizeDatabaseError(error);
  });
  let transactionRowId: string | null = null;
  let newBalance = 0;

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT id, balance
       FROM casino_users
       WHERE wallet_address = $1
       FOR UPDATE`,
      [walletAddress]
    );

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const currentBalance = Number(user.balance ?? 0);
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const updateBalanceResult = await client.query(
      `UPDATE casino_users
       SET balance = balance - $1
       WHERE id = $2
       RETURNING balance`,
      [amount, user.id]
    );
    newBalance = Number(updateBalanceResult.rows[0]?.balance ?? 0);

    const txInsertResult = await client.query(
      `INSERT INTO casino_transactions (user_id, type, amount, status)
       VALUES ($1, 'withdraw', $2, 'pending')
       RETURNING id`,
      [user.id, amount]
    );
    transactionRowId = txInsertResult.rows[0]?.id as string;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const dbError = normalizeDatabaseError(error);
    return NextResponse.json(
      {
        error: 'Persistent storage unavailable',
        details: dbError.message,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }

  try {
    const { rpcUrl } = getRequiredServerTokenEnv();
    const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
    if (!treasuryPrivateKey) {
      throw new Error('TREASURY_PRIVATE_KEY is not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const secretKey = bs58.decode(treasuryPrivateKey);
    const treasuryKeypair = Keypair.fromSecretKey(secretKey);
    const destination = new PublicKey(walletAddress);
    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    if (lamports <= 0) {
      throw new Error('Withdraw amount is too small.');
    }

    let signature: string;
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey: destination,
          lamports,
        })
      );
      signature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair], {
        commitment: 'confirmed',
      });
    } catch (transferError) {
      if (transactionRowId) {
        const recoveryClient = await db.connect().catch((error) => {
          throw normalizeDatabaseError(error);
        });
        try {
          await recoveryClient.query('BEGIN');
          await recoveryClient.query(
            `UPDATE casino_users
             SET balance = balance + $1
             WHERE wallet_address = $2`,
            [amount, walletAddress]
          );
          await recoveryClient.query(
            `UPDATE casino_transactions
             SET status = 'failed'
             WHERE id = $1`,
            [transactionRowId]
          );
          await recoveryClient.query('COMMIT');
        } catch (recoveryError) {
          await recoveryClient.query('ROLLBACK');
          console.error('Failed to restore withdrawal balance after transfer failure:', recoveryError);
        } finally {
          recoveryClient.release();
        }
      }

      return NextResponse.json(
        {
          error: 'Withdrawal transfer failed',
          details: transferError instanceof Error ? transferError.message : 'unknown',
        },
        { status: 500 }
      );
    }

    if (transactionRowId) {
      try {
        await db.query(
          `UPDATE casino_transactions
           SET status = 'confirmed', tx_signature = $1
           WHERE id = $2`,
          [signature, transactionRowId]
        );
      } catch (dbError) {
        console.error(
          `CRITICAL: Transferred SOL to ${walletAddress} (sig: ${signature}) but failed to update status logic for tx id ${transactionRowId}. Error:`,
          dbError
        );
      }
    }

    return NextResponse.json({ txSignature: signature, newBalance });
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
        error: 'Unexpected withdrawal error',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
