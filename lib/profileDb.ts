import { db } from '@/lib/db';

export async function ensureUserProfileColumns() {
  await db.query(`
    ALTER TABLE casino_users
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(48),
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
  `);
}
