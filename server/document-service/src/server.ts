import Fastify from 'fastify'
import { Pool } from 'pg'
import { loadConfig } from './config.js'
import { BlobStore } from './storage.js'

const config = loadConfig()
const db = new Pool({ connectionString: config.databaseUrl })
const blobs = new BlobStore(config)
const app = Fastify({ logger: true })

for (const path of ['/healthz', '/api/healthz']) {
  app.get(path, async (_request, reply) => {
    await db.query('SELECT 1')
    return reply.send({ ok: true, service: 'bento-document-service' })
  })
}

app.get('/api/v1/documents', async (_request, reply) => {
  return reply.code(501).send({ error: 'not_implemented', message: 'Document listing is the next service slice.' })
})

app.get('/api/v1/documents/:docId', async (_request, reply) => {
  return reply.code(501).send({ error: 'not_implemented', message: 'Document retrieval is the next service slice.' })
})

app.addHook('onClose', async () => {
  await db.end()
})

void blobs

app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error(error)
  process.exitCode = 1
})
