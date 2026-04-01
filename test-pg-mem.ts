import { newDb } from 'pg-mem';

function test() {
  const db = newDb();
  
  // Need to add this for standard Postgres syntax compatibility
  db.public.none(`
    CREATE TABLE casino_users (
      id SERIAL PRIMARY KEY,
      wallet_address TEXT UNIQUE NOT NULL,
      balance NUMERIC NOT NULL DEFAULT 0
    );

    CREATE TABLE casino_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES casino_users(id),
      type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      status TEXT NOT NULL,
      tx_signature TEXT UNIQUE
    );
  `);
  
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  
  pool.query(`
    INSERT INTO casino_users (wallet_address, balance)
    VALUES ($1, 0)
    ON CONFLICT (wallet_address) DO NOTHING
  `, ['123'], (err: unknown, res: unknown) => {
    if (err) console.error(err);
    else console.log('Insert OK');
    pool.end();
  });
}
test();
