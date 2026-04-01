import { Pool, type PoolConfig } from 'pg';
import { getServerEnv } from '@/lib/env/server';

const databaseUrl = process.env.DATABASE_URL?.trim();

declare global {
  var __pythCasinoDbPool: Pool | undefined;
}

export class DatabaseConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DatabaseConnectionError';
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function getRequiredDatabaseUrl() {
  const envDatabaseUrl = databaseUrl || getServerEnv().DATABASE_URL;
  if (!envDatabaseUrl) {
    throw new DatabaseConnectionError(
      'DATABASE_URL is not configured. Add your Supabase Postgres connection string to .env.local.'
    );
  }

  if (envDatabaseUrl === 'postgresql://user:password@localhost:5432/pyth_casino') {
    throw new DatabaseConnectionError(
      'DATABASE_URL is still using the placeholder value. Replace it with your real Supabase Postgres connection string.'
    );
  }

  return envDatabaseUrl;
}

function createPool() {
  const rawConnectionString = getRequiredDatabaseUrl();
  const connectionString = sanitizeConnectionString(rawConnectionString);
  const isHostedPostgres =
    connectionString.includes('supabase.com') || connectionString.includes('pooler.supabase.com');

  const config: PoolConfig = {
    connectionString,
    ssl: isHostedPostgres ? { rejectUnauthorized: false } : undefined,
  };

  return new Pool(config);
}

function sanitizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    // node-postgres lets sslmode in the URL override the explicit ssl object,
    // which defeats our relaxed local SSL handling for hosted poolers.
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

function normalizeDatabaseError(error: unknown) {
  if (error instanceof DatabaseConnectionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseConnectionError(`Database connection failed: ${message}`, { cause: error });
}

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  if (global.__pythCasinoDbPool) {
    pool = global.__pythCasinoDbPool;
    return pool;
  }

  try {
    pool = createPool();
  } catch (error) {
    throw normalizeDatabaseError(error);
  }

  pool.on('error', (error) => {
    console.error('Postgres pool error:', error);
  });

  if (process.env.NODE_ENV !== 'production') {
    global.__pythCasinoDbPool = pool;
  }

  return pool;
}

export { normalizeDatabaseError };
export const db = new Proxy({} as Pool, {
  get(_target, prop) {
    const actualPool = getPool();
    const value = actualPool[prop as keyof Pool];
    return typeof value === 'function' ? value.bind(actualPool) : value;
  }
});
