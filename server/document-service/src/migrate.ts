import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const migrations = [
  ['001_initial', '001_initial.sql'],
  ['002_vault_keys', '002_vault_keys.sql'],
  ['003_session_room_index', '003_session_room_index.sql'],
] as const

const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  for (const [version, filename] of migrations) {
    const existing = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [version],
    )
    if (existing.rowCount !== 0) continue
    const migration = await readFile(
      fileURLToPath(new URL(`../migrations/${filename}`, import.meta.url)),
      'utf8',
    )
    await client.query(migration)
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
  }
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
