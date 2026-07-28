import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { AdapterConfig } from './config.js'
import { BrowserBridge } from './bridge.js'
import { createMcpServer } from './tools.js'

const allowed = '00000000-0000-0000-0000-000000000001'
const config: AdapterConfig = {
  documentServiceUrl: 'https://documents.example.test',
  documentServiceToken: 'secret-token',
  host: '127.0.0.1',
  port: 8790,
  allowedDocIds: new Set([allowed]),
}

test('document tools enforce the adapter document allowlist', async () => {
  let backendCalls = 0
  const fakeClient = {
    getDocument: async () => { backendCalls += 1; return { docId: allowed } },
    listDocuments: async () => ({ documents: [] }),
    listVersions: async () => ({ versions: [] }),
    startSession: async () => ({}),
    closeSession: async () => ({}),
    deleteDocument: async () => ({}),
  }
  const server = createMcpServer(config, fakeClient as never)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const response = await client.callTool({ name: 'get_document', arguments: { docId: '00000000-0000-0000-0000-000000000002' } })
  assert.equal(response.isError, true)
  assert.equal(backendCalls, 0)
  await client.close()
  await server.close()
})

test('browser bridge exposes targeted deck actions', async () => {
  const bridge = new BrowserBridge()
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const tools = await client.listTools()
  const names = tools.tools.map((tool) => tool.name)
  for (const name of ['get_deck_summary', 'render_slide', 'validate_slide', 'create_slide', 'add_text', 'update_element', 'delete_element', 'set_speaker_notes']) {
    assert.ok(names.includes(name), `missing ${name}`)
  }
  await client.close()
  await server.close()
})

test('render_slide returns MCP image content and bounded metadata', async () => {
  const calls: Array<{ docId: string; operation: string; params?: Record<string, unknown> }> = []
  const bridge = {
    request: async (docId: string, operation: string, _json?: string, params?: Record<string, unknown>) => {
      calls.push({ docId, operation, params })
      return { slideId: 'slide-1', mimeType: 'image/png', data: 'cG5n', width: 640, height: 360, bytes: 3, warnings: [], revision: 4 }
    },
  } as unknown as BrowserBridge
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const response = await client.callTool({ name: 'render_slide', arguments: { docId: allowed, slideId: 'slide-1', width: 640 } })
  const content = response.content as Array<{ type: string; text?: string }>
  assert.equal(response.isError, undefined)
  assert.equal(content[0]?.type, 'image')
  assert.deepEqual(calls, [{ docId: allowed, operation: 'render_slide', params: { slideId: 'slide-1', width: 640 } }])
  assert.equal(content[1]?.type, 'text')
  if (content[1]?.type === 'text' && content[1].text) {
    const metadata = JSON.parse(content[1].text) as Record<string, unknown>
    assert.equal(metadata.data, undefined)
    assert.equal(metadata.revision, 4)
  }
  await client.close()
  await server.close()
})
