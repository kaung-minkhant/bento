import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { Pool, type PoolClient } from 'pg'
import { loadConfig, type ServiceConfig } from './config.js'
import { authenticate } from './auth.js'
import {
  createDocumentSchema,
  createVaultKeySchema,
  createVersionSchema,
  decodeBase64url,
  recoverySchema,
  type CreateDocumentInput,
  type CreateVaultKeyInput,
  type CreateVersionInput,
  type RecoveryInput,
} from './schema.js'
import { BlobStore } from './storage.js'

type Db = Pool | PoolClient
type DocumentRow = {
  doc_id: string
  owner_subject: string
  format: string
  current_version_id: string | null
  metadata_ciphertext: string
  metadata_nonce: string
  metadata_version: number
  created_at: Date
  updated_at: Date
}
type VersionRow = {
  version_id: string
  doc_id: string
  object_key: string
  ciphertext_sha256: string
  byte_size: string | number
  created_by_subject: string
  parent_version_id: string | null
  label_ciphertext: string | null
  created_at: Date
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message)
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('base64url')
}

function validateBlob(input: { ciphertext: string; sha256: string; byteSize?: number }): Buffer {
  const body = decodeBase64url(input.ciphertext)
  if (sha256(body) !== input.sha256) {
    fail(400, 'digest_mismatch', 'The ciphertext SHA-256 digest does not match the payload.')
  }
  if (input.byteSize !== undefined && input.byteSize !== body.byteLength) {
    fail(400, 'size_mismatch', 'The ciphertext byte size does not match the payload.')
  }
  return body
}

function objectKey(docId: string, kind: 'versions' | 'recovery', id: string): string {
  return `documents/${docId}/${kind}/${id}.bento.html.enc`
}

function cursorFor(row: DocumentRow): string {
  return Buffer.from(JSON.stringify({ updatedAt: row.updated_at.toISOString(), docId: row.doc_id })).toString('base64url')
}

function decodeCursor(value: unknown): { updatedAt: string; docId: string } | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof parsed.updatedAt === 'string' && typeof parsed.docId === 'string') return parsed
  } catch {
    /* invalid cursors are treated as a client error by the route */
  }
  return null
}

function documentJson(row: DocumentRow, role: string) {
  return {
    docId: row.doc_id,
    ownerSubject: row.owner_subject,
    format: row.format,
    currentVersionId: row.current_version_id,
    metadata: {
      ciphertext: row.metadata_ciphertext,
      nonce: row.metadata_nonce,
      version: row.metadata_version,
    },
    role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function versionJson(row: VersionRow) {
  return {
    versionId: row.version_id,
    docId: row.doc_id,
    ciphertextSha256: row.ciphertext_sha256,
    byteSize: Number(row.byte_size),
    createdBySubject: row.created_by_subject,
    parentVersionId: row.parent_version_id,
    labelCiphertext: row.label_ciphertext,
    createdAt: row.created_at,
  }
}

async function readDocument(db: Db, docId: string, subject: string): Promise<{ row: DocumentRow; role: string } | null> {
  const result = await db.query<DocumentRow & { member_role: string | null }>(`
    SELECT d.*, CASE WHEN d.owner_subject = $2 THEN 'owner' ELSE m.role END AS member_role
    FROM documents d
    LEFT JOIN document_members m ON m.doc_id = d.doc_id AND m.subject = $2 AND m.revoked_at IS NULL
    WHERE d.doc_id = $1
      AND d.deleted_at IS NULL
      AND (d.owner_subject = $2 OR m.subject IS NOT NULL)
  `, [docId, subject])
  const row = result.rows[0]
  return row ? { row, role: row.member_role ?? 'reader' } : null
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply, config: ServiceConfig): Promise<string | null> {
  const result = await authenticate(request, config)
  if (typeof result === 'string') return result
  void reply.code(result.status).send({ error: result.code, message: result.message })
  return null
}

function parseBody<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } } }, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) fail(400, 'invalid_request', 'The request body is invalid.')
  return result.data
}

function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: error.code, message: error.message })
    }
    app.log.error(error)
    return reply.code(500).send({ error: 'internal_error', message: 'The document service could not complete the request.' })
  })
}

export function buildApp(
  config: ServiceConfig = loadConfig(),
  db: Pool = new Pool({ connectionString: config.databaseUrl }),
  blobs: BlobStore = new BlobStore(config),
): FastifyInstance {
  const app = Fastify({ logger: true })
  registerErrorHandler(app)

  for (const path of ['/healthz', '/api/healthz']) {
    app.get(path, async (_request, reply) => {
      await db.query('SELECT 1')
      return reply.send({ ok: true, service: 'bento-document-service' })
    })
  }

  app.get('/api/v1/auth/config', async (_request, reply) => {
    if (!config.oidcIssuerUrl || !config.oidcClientId) {
      return reply.code(404).send({ error: 'oidc_not_configured', message: 'OIDC login is not configured.' })
    }
    return reply.send({ issuer: config.oidcIssuerUrl, clientId: config.oidcClientId, audience: config.oidcAudience })
  })

  app.get('/api/v1/vault/key', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const result = await db.query<{
      wrapped_key_ciphertext: string
      wrapped_key_salt: string
      wrapped_key_nonce: string
      wrapped_key_version: number
    }>(`
      SELECT wrapped_key_ciphertext, wrapped_key_salt, wrapped_key_nonce, wrapped_key_version
      FROM user_vault_keys WHERE owner_subject = $1
    `, [subject])
    const row = result.rows[0]
    if (!row) return reply.send({ wrappedKey: null })
    return reply.send({ wrappedKey: {
      ciphertext: row.wrapped_key_ciphertext,
      salt: row.wrapped_key_salt,
      nonce: row.wrapped_key_nonce,
      version: row.wrapped_key_version,
    } })
  })

  app.post('/api/v1/vault/key', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const input = parseBody<CreateVaultKeyInput>(createVaultKeySchema, request.body)
    try {
      await db.query(`
        INSERT INTO user_vault_keys
          (owner_subject, wrapped_key_ciphertext, wrapped_key_salt, wrapped_key_nonce, wrapped_key_version)
        VALUES ($1, $2, $3, $4, $5)
      `, [subject, input.wrappedKey.ciphertext, input.wrappedKey.salt, input.wrappedKey.nonce, input.wrappedKey.version])
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'vault_key_exists', message: 'A hosted vault is already set up for this account.' })
      throw error
    }
    return reply.code(201).send({ ok: true })
  })

  app.post('/api/v1/documents', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const input = parseBody<CreateDocumentInput>(createDocumentSchema, request.body)
    const body = validateBlob(input.initialVersion)
    const versionId = randomUUID()
    const key = objectKey(input.docId, 'versions', versionId)

    await blobs.put({ key, body, sha256: input.initialVersion.sha256, contentLength: body.byteLength })
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`
        INSERT INTO documents (doc_id, owner_subject, format, metadata_ciphertext, metadata_nonce, metadata_version)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [input.docId, subject, input.format, input.metadata.ciphertext, input.metadata.nonce, input.metadata.version])
      await client.query(`
        INSERT INTO document_versions
          (version_id, doc_id, object_key, ciphertext_sha256, byte_size, created_by_subject)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [versionId, input.docId, key, input.initialVersion.sha256, body.byteLength, subject])
      await client.query('UPDATE documents SET current_version_id = $1 WHERE doc_id = $2', [versionId, input.docId])
      await client.query('INSERT INTO document_members (doc_id, subject, role) VALUES ($1, $2, $3)', [input.docId, subject, 'owner'])
      await client.query('COMMIT')
    } catch (error: any) {
      await client.query('ROLLBACK')
      await blobs.delete(key).catch(() => undefined)
      if (error?.code === '23505') fail(409, 'document_exists', 'A document with this docId already exists.')
      throw error
    } finally {
      client.release()
    }

    const document = await readDocument(db, input.docId, subject)
    return reply.code(201).send(document ? documentJson(document.row, document.role) : { docId: input.docId })
  })

  app.get('/api/v1/documents', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const query = request.query as { cursor?: string; limit?: string }
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100)
    const cursor = query.cursor ? decodeCursor(query.cursor) : null
    if (query.cursor && !cursor) return reply.code(400).send({ error: 'invalid_cursor', message: 'The cursor is invalid.' })
    const result = await db.query<DocumentRow & { member_role: string | null }>(`
      SELECT d.*, CASE WHEN d.owner_subject = $1 THEN 'owner' ELSE m.role END AS member_role
      FROM documents d
      LEFT JOIN document_members m ON m.doc_id = d.doc_id AND m.subject = $1 AND m.revoked_at IS NULL
      WHERE d.deleted_at IS NULL
        AND (d.owner_subject = $1 OR m.subject IS NOT NULL)
        AND ($2::timestamptz IS NULL OR (d.updated_at, d.doc_id) < ($2::timestamptz, $3))
      ORDER BY d.updated_at DESC, d.doc_id DESC
      LIMIT $4
    `, [subject, cursor?.updatedAt ?? null, cursor?.docId ?? null, limit])
    const documents = result.rows.map((row) => documentJson(row, row.member_role ?? 'reader'))
    return reply.send({ documents, nextCursor: result.rows.length === limit ? cursorFor(result.rows.at(-1)!) : null })
  })

  app.get('/api/v1/documents/:docId', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId } = request.params as { docId: string }
    const document = await readDocument(db, docId, subject)
    if (!document) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    return reply.send(documentJson(document.row, document.role))
  })

  app.get('/api/v1/documents/:docId/versions', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId } = request.params as { docId: string }
    if (!await readDocument(db, docId, subject)) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    const result = await db.query<VersionRow>(`
      SELECT version_id, doc_id, object_key, ciphertext_sha256, byte_size,
             created_by_subject, parent_version_id, label_ciphertext, created_at
      FROM document_versions WHERE doc_id = $1 ORDER BY created_at DESC
    `, [docId])
    return reply.send({ versions: result.rows.map(versionJson) })
  })

  app.delete('/api/v1/documents/:docId', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId } = request.params as { docId: string }
    const document = await readDocument(db, docId, subject)
    if (!document) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    if (document.role !== 'owner') return reply.code(403).send({ error: 'forbidden', message: 'Only the document owner can delete it.' })

    const client = await db.connect()
    const objectKeys: string[] = []
    try {
      await client.query('BEGIN')
      const versions = await client.query<{ object_key: string }>(
        'SELECT object_key FROM document_versions WHERE doc_id = $1', [docId])
      const recovery = await client.query<{ object_key: string }>(
        'SELECT object_key FROM document_recovery WHERE doc_id = $1', [docId])
      objectKeys.push(...versions.rows.map((row) => row.object_key), ...recovery.rows.map((row) => row.object_key))
      await client.query('UPDATE documents SET deleted_at = now(), updated_at = now() WHERE doc_id = $1 AND deleted_at IS NULL', [docId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    // The database tombstone is authoritative. Blob cleanup is best effort so
    // a transient SeaweedFS failure cannot make a successful delete appear to
    // fail or expose the document in the library again.
    for (const key of objectKeys) await blobs.delete(key).catch((error) => app.log.warn({ error, key }, 'Could not remove deleted document blob'))
    return reply.code(204).send()
  })

  app.get('/api/v1/documents/:docId/versions/:versionId/content', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId, versionId } = request.params as { docId: string; versionId: string }
    if (!await readDocument(db, docId, subject)) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    const result = await db.query<VersionRow>(`
      SELECT version_id, doc_id, object_key, ciphertext_sha256, byte_size,
             created_by_subject, parent_version_id, label_ciphertext, created_at
      FROM document_versions WHERE doc_id = $1 AND version_id = $2
    `, [docId, versionId])
    const version = result.rows[0]
    if (!version) return reply.code(404).send({ error: 'not_found', message: 'The version was not found.' })
    const object = await blobs.get(version.object_key)
    if (!object.Body) return reply.code(404).send({ error: 'blob_not_found', message: 'The document blob was not found.' })
    reply.type('application/octet-stream').header('Content-Length', String(version.byte_size))
    return reply.send(object.Body)
  })

  app.post('/api/v1/documents/:docId/versions', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId } = request.params as { docId: string }
    const input = parseBody<CreateVersionInput>(createVersionSchema, request.body)
    const body = validateBlob(input)
    const document = await readDocument(db, docId, subject)
    if (!document) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    if (document.role === 'reader') return reply.code(403).send({ error: 'forbidden', message: 'The document is read-only for this subject.' })
    if (!input.parentVersionId) return reply.code(409).send({ error: 'parent_required', message: 'A parent version is required for a new durable version.' })

    const versionId = randomUUID()
    const key = objectKey(docId, 'versions', versionId)
    await blobs.put({ key, body, sha256: input.sha256, contentLength: body.byteLength })
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const current = await client.query<{ current_version_id: string | null }>(
        'SELECT current_version_id FROM documents WHERE doc_id = $1 AND deleted_at IS NULL FOR UPDATE', [docId])
      if (current.rows[0]?.current_version_id !== input.parentVersionId) {
        await client.query('ROLLBACK')
        await blobs.delete(key).catch(() => undefined)
        return reply.code(409).send({ error: 'version_conflict', message: 'The document changed since this version was opened.' })
      }
      await client.query(`
        INSERT INTO document_versions
          (version_id, doc_id, object_key, ciphertext_sha256, byte_size, created_by_subject, parent_version_id, label_ciphertext)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [versionId, docId, key, input.sha256, body.byteLength, subject, input.parentVersionId, input.labelCiphertext ?? null])
      await client.query('UPDATE documents SET current_version_id = $1, updated_at = now() WHERE doc_id = $2', [versionId, docId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      await blobs.delete(key).catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    const result = await db.query<VersionRow>(`
      SELECT version_id, doc_id, object_key, ciphertext_sha256, byte_size,
             created_by_subject, parent_version_id, label_ciphertext, created_at
      FROM document_versions WHERE version_id = $1
    `, [versionId])
    return reply.code(201).send(versionJson(result.rows[0]))
  })

  app.put('/api/v1/documents/:docId/recovery', async (request, reply) => {
    const subject = await requireAuth(request, reply, config)
    if (!subject) return
    const { docId } = request.params as { docId: string }
    const input = parseBody<RecoveryInput>(recoverySchema, request.body)
    const body = validateBlob(input)
    const document = await readDocument(db, docId, subject)
    if (!document) return reply.code(404).send({ error: 'not_found', message: 'The document was not found.' })
    if (document.role === 'reader') return reply.code(403).send({ error: 'forbidden', message: 'The document is read-only for this subject.' })

    const checkpointId = randomUUID()
    const key = objectKey(docId, 'recovery', checkpointId)
    await blobs.put({ key, body, sha256: input.sha256, contentLength: body.byteLength })
    const client = await db.connect()
    let previousKey: string | null = null
    try {
      await client.query('BEGIN')
      const previous = await client.query<{ object_key: string }>('SELECT object_key FROM document_recovery WHERE doc_id = $1 FOR UPDATE', [docId])
      previousKey = previous.rows[0]?.object_key ?? null
      await client.query(`
        INSERT INTO document_recovery
          (doc_id, object_key, ciphertext_sha256, byte_size, created_by_subject, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (doc_id) DO UPDATE SET
          object_key = EXCLUDED.object_key,
          ciphertext_sha256 = EXCLUDED.ciphertext_sha256,
          byte_size = EXCLUDED.byte_size,
          created_by_subject = EXCLUDED.created_by_subject,
          created_at = now(),
          expires_at = EXCLUDED.expires_at
      `, [docId, key, input.sha256, body.byteLength, subject, input.expiresAt])
      await client.query('UPDATE documents SET updated_at = now() WHERE doc_id = $1', [docId])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      await blobs.delete(key).catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    if (previousKey && previousKey !== key) await blobs.delete(previousKey).catch(() => undefined)
    return reply.code(204).send()
  })

  app.addHook('onClose', async () => {
    await db.end()
  })
  return app
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const config = loadConfig()
  const app = buildApp(config)
  app.listen({ host: config.host, port: config.port }).catch((error) => {
    app.log.error(error)
    process.exitCode = 1
  })
}
