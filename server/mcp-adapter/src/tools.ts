import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AdapterConfig } from './config.js'
import { DocumentServiceClient } from './client.js'
import { BrowserBridge } from './bridge.js'

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

export function createMcpServer(config: AdapterConfig, client = new DocumentServiceClient(config), bridge?: BrowserBridge) {
  const server = new McpServer({ name: 'bento-document-service', version: '1.0.0' })
  const assertAllowed = (docId: string) => {
    if (config.allowedDocIds.size && !config.allowedDocIds.has(docId)) {
      throw new Error('This MCP adapter is not authorized for that document.')
    }
  }

  server.registerTool('list_documents', {
    description: 'List encrypted bento documents accessible to this adapter subject. Content and titles remain encrypted.',
    inputSchema: { limit: z.number().int().min(1).max(100).default(50), cursor: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit, cursor }) => {
    const page = await client.listDocuments(limit, cursor)
    const documents = config.allowedDocIds.size
      ? page.documents.filter((document) => typeof document === 'object' && document !== null && 'docId' in document && config.allowedDocIds.has(String(document.docId)))
      : page.documents
    return result({ ...page, documents })
  })

  server.registerTool('get_document', {
    description: 'Read encrypted metadata and access role for one explicitly selected bento document.',
    inputSchema: { docId: z.string().uuid() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.getDocument(docId)) })

  server.registerTool('list_versions', {
    description: 'List immutable version metadata for one explicitly selected bento document. Snapshot content stays encrypted.',
    inputSchema: { docId: z.string().uuid() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.listVersions(docId)) })

  server.registerTool('start_session', {
    description: 'Start or resume a live collaboration session for one explicitly selected document.',
    inputSchema: { docId: z.string().uuid(), relayRoom: z.string().url(), sessionId: z.string().uuid().optional() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ docId, relayRoom, sessionId }) => { assertAllowed(docId); return result(await client.startSession(docId, relayRoom, sessionId)) })

  server.registerTool('close_session', {
    description: 'Close a live collaboration session for one explicitly selected document.',
    inputSchema: { docId: z.string().uuid(), sessionId: z.string().uuid() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ docId, sessionId }) => { assertAllowed(docId); return result(await client.closeSession(docId, sessionId)) })

  server.registerTool('delete_document', {
    description: 'Permanently request deletion of one explicitly selected hosted document. Requires an explicit confirmation value.',
    inputSchema: { docId: z.string().uuid(), confirm: z.literal('delete') },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.deleteDocument(docId)) })

  if (bridge) {
    server.registerTool('agent_read_document', {
      description: 'Read the plaintext document model from the explicitly connected browser editor. Requires an intentional browser bridge connection.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'read_document')) })

    server.registerTool('agent_replace_document', {
      description: 'Replace the explicitly connected browser editor document through its normal undoable mutation path.',
      inputSchema: { docId: z.string().uuid(), json: z.string().min(2).max(50_000_000) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, json }) => { assertAllowed(docId); return result(await bridge.request(docId, 'replace_document', json)) })
  }

  return server
}
