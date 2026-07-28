import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentServiceClient } from './client.js'
import type { AdapterConfig } from './config.js'

const config: AdapterConfig = {
  documentServiceUrl: 'https://documents.example.test',
  documentServiceToken: 'secret-token',
  host: '127.0.0.1',
  port: 8790,
  allowedDocIds: new Set(),
}

test('document requests carry the configured bearer token', async () => {
  let request: Request | undefined
  const client = new DocumentServiceClient(config, (async (input, init) => {
    request = new Request(input, init)
    return new Response(JSON.stringify({ documents: [], nextCursor: null }), { status: 200 })
  }) as typeof fetch)

  await client.listDocuments(10)
  assert.equal(request?.headers.get('authorization'), 'Bearer secret-token')
  assert.equal(new URL(request!.url).pathname, '/api/v1/documents')
})

test('service errors include the response status and message', async () => {
  const client = new DocumentServiceClient(config, (async () =>
    new Response(JSON.stringify({ error: 'forbidden', message: 'No access' }), { status: 403 })
  ) as typeof fetch)

  await assert.rejects(() => client.getDocument('00000000-0000-0000-0000-000000000001'), /Document service 403: No access/)
})
