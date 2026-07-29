import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { AdapterConfig } from './config.js'
import { BrowserBridge } from './bridge.js'
import { createMcpServer } from './tools.js'
import { AUTHORING_TOPICS, OPERATION_GUIDES, authoringGuide } from './authoring.js'

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
  for (const name of ['get_authoring_guide', 'get_deck_summary', 'get_deck_style', 'inspect_design_system', 'inspect_deck_quality', 'list_composition_recipes', 'create_slide_from_recipe', 'get_slide', 'render_slide', 'render_deck_thumbnails', 'validate_slide', 'apply_operations', 'create_slide', 'add_text', 'update_element', 'delete_element', 'set_speaker_notes']) {
    assert.ok(names.includes(name), `missing ${name}`)
  }
  await client.close()
  await server.close()
})

test('authoring resources and fallback tool expose topic-specific guidance', async () => {
  const server = createMcpServer(config)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const resources = await client.listResources()
  assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), AUTHORING_TOPICS.map((topic) => `bento://authoring/${topic}`).sort())
  const workflow = await client.readResource({ uri: 'bento://authoring/workflow' })
  assert.ok(workflow.contents[0] && 'text' in workflow.contents[0])
  assert.match(workflow.contents[0].text, /dryRun:true/)
  const operation = await client.callTool({ name: 'get_authoring_guide', arguments: { topic: 'overview', operation: 'create_chart' } })
  assert.equal(operation.isError, undefined)
  assert.match(JSON.stringify(operation.content), /ECharts-compatible/)
  await client.close()
  await server.close()
})

test('authoring guide covers every implemented operation and recipe id', () => {
  const operationSource = readFileSync(new URL('../../../slides/src/agent-operations.ts', import.meta.url), 'utf8')
  const prepareSource = operationSource.slice(operationSource.indexOf('export function prepareAgentOperations'), operationSource.indexOf('function findSlide'))
  const implemented = new Set([...prepareSource.matchAll(/type === '([a-z_]+)'/g)].map((match) => match[1]))
  const createTypes = /const createTypes = new Set\(\[([^\]]+)\]/.exec(operationSource)?.[1] ?? ''
  for (const match of createTypes.matchAll(/'([a-z_]+)'/g)) implemented.add(match[1])
  const documented = new Set(OPERATION_GUIDES.map((operation) => operation.type))
  assert.deepEqual([...documented].sort(), [...implemented].sort())

  const recipeSource = readFileSync(new URL('../../../slides/src/composition-recipes.ts', import.meta.url), 'utf8')
  const recipeIds = [...recipeSource.matchAll(/\bid: '([a-z-]+)'/g)].map((match) => match[1])
  const recipeGuide = authoringGuide('recipes').markdown
  for (const id of recipeIds) assert.match(recipeGuide, new RegExp(`\\b${id}\\b`))

  const elementGuide = authoringGuide('elements').markdown
  const motionGuide = authoringGuide('motion').markdown
  assert.match(elementGuide, /buildStep/)
  assert.match(elementGuide, /integer from 1 through 999/)
  assert.match(motionGuide, /click, Space, or a forward arrow/)
  assert.match(motionGuide, /only elements visible at both ends participate in a morph/)
})

test('apply_operations forwards revision, dry-run, and operation batch', async () => {
  const calls: Array<{ docId: string; operation: string; params?: Record<string, unknown> }> = []
  const bridge = {
    request: async (docId: string, operation: string, _json?: string, params?: Record<string, unknown>) => {
      calls.push({ docId, operation, params })
      return { dryRun: true, previousRevision: 7, currentRevision: 7, operationCount: 1, created: {}, affectedSlideIds: ['slide-1'] }
    },
  } as unknown as BrowserBridge
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const operations = [{ type: 'update_slide', slideId: 'slide-1', patch: { background: '#071E2A' } }]
  const response = await client.callTool({ name: 'apply_operations', arguments: { docId: allowed, expectedRevision: 7, dryRun: true, operations } })
  assert.equal(response.isError, undefined)
  assert.deepEqual(calls, [{ docId: allowed, operation: 'apply_operations', params: { expectedRevision: 7, dryRun: true, operations } }])
  await client.close()
  await server.close()
})

test('inspect_design_system forwards a read-only design-language request', async () => {
  const calls: Array<{ docId: string; operation: string }> = []
  const bridge = {
    request: async (docId: string, operation: string) => {
      calls.push({ docId, operation })
      return { docId, revision: 3, declared: {}, inferred: { colors: [] }, slideCount: 2 }
    },
  } as unknown as BrowserBridge
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const response = await client.callTool({ name: 'inspect_design_system', arguments: { docId: allowed } })
  assert.equal(response.isError, undefined)
  assert.deepEqual(calls, [{ docId: allowed, operation: 'design_language' }])
  await client.close()
  await server.close()
})

test('inspect_deck_quality forwards a read-only deck audit request', async () => {
  const calls: Array<{ docId: string; operation: string }> = []
  const bridge = {
    request: async (docId: string, operation: string) => {
      calls.push({ docId, operation })
      return { docId, revision: 5, score: 91, rating: 'excellent', findings: [] }
    },
  } as unknown as BrowserBridge
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const response = await client.callTool({ name: 'inspect_deck_quality', arguments: { docId: allowed } })
  assert.equal(response.isError, undefined)
  assert.deepEqual(calls, [{ docId: allowed, operation: 'deck_quality' }])
  await client.close()
  await server.close()
})

test('create_slide_from_recipe forwards structured content and revision', async () => {
  const calls: Array<{ docId: string; operation: string; params?: Record<string, unknown> }> = []
  const bridge = {
    request: async (docId: string, operation: string, _json?: string, params?: Record<string, unknown>) => {
      calls.push({ docId, operation, params })
      return { slideId: 'slide-recipe', index: 2, previousRevision: 4, currentRevision: 5 }
    },
  } as unknown as BrowserBridge
  const server = createMcpServer({ ...config, bridgeToken: 'bridge-token' }, undefined, bridge)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const content = { title: 'Evidence', thesis: 'One clear result.' }
  const response = await client.callTool({ name: 'create_slide_from_recipe', arguments: { docId: allowed, expectedRevision: 4, recipeId: 'title-thesis', content, afterSlideId: 'slide-1' } })
  assert.equal(response.isError, undefined)
  assert.deepEqual(calls, [{ docId: allowed, operation: 'create_slide_from_recipe', params: { expectedRevision: 4, recipeId: 'title-thesis', content, afterSlideId: 'slide-1' } }])
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
