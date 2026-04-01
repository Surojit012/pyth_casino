
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const tmpWallet = "TEST" + Date.now().toString().slice(-10);
  console.log("Creating test user with wallet:", tmpWallet);
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Inserting user...");
    const userRes = await client.query(
      `INSERT INTO casino_users (wallet_address, balance) VALUES ($1, 100) RETURNING id`,
      [tmpWallet]
    );
    await client.query("COMMIT");
    console.log("Inserted test user with 100 balance. ID:", userRes.rows[0].id);
    
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ walletAddress: tmpWallet }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log("JWT Token generated:");
    console.log(token);
    
    console.log("\nAttempting withdraw of 10 from localhost...");
    const res = await fetch('http://localhost:3000/api/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount: 10 })
    });
    const text = await res.text();
    console.log(`Response [${res.status}]:`, text);
    
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}
run();
