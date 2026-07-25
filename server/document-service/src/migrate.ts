import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const migration = await readFile(
  fileURLToPath(new URL('../migrations/001_initial.sql', import.meta.url)),
  'utf8',
)

const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const existing = await client.query(
    'SELECT 1 FROM schema_migrations WHERE version = $1',
    ['001_initial'],
  )
  if (existing.rowCount === 0) {
    await client.query(migration)
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', ['001_initial'])
  }
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
