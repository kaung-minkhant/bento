import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadConfig } from './config.js'
import { DocumentServiceClient } from './client.js'
import { createMcpServer } from './tools.js'
import { BrowserBridge } from './bridge.js'

const config = loadConfig()
const bridge = new BrowserBridge()
const webSockets = new WebSocketServer({ noServer: true })
const jsonBody = async (request: import('node:http').IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
const sendJson = (response: import('node:http').ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  if (response.writableEnded) return
  response.writeHead(status, { ...headers, 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const httpServer = createServer(async (request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, service: 'bento-mcp-adapter' }))
    return
  }
  if (request.url === '/pairings' && request.method === 'OPTIONS') {
    if (!response.writableEnded) response.writeHead(204, corsHeaders).end()
    return
  }
  if (request.url === '/pairings' && request.method === 'POST') {
    try {
      if (!config.bridgeToken) throw new Error('Browser agent pairing is disabled.')
      const body = await jsonBody(request) as { docId?: string }
      if (!body.docId) throw new Error('docId is required.')
      sendJson(response, 200, bridge.createPairing(body.docId, config.allowedDocIds), corsHeaders)
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'pairing failed' }, corsHeaders)
    }
    return
  }
  if (request.url !== '/mcp' || !['GET', 'POST', 'DELETE'].includes(request.method ?? '')) {
    response.writeHead(404).end()
    return
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const server = createMcpServer(config, new DocumentServiceClient(config), config.bridgeToken ? bridge : undefined)
  try {
    await server.connect(transport)
    await transport.handleRequest(request, response)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'mcp_error' }))
  }
})

httpServer.on('upgrade', (request, socket, head) => {
  const path = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
  if (path !== '/bridge' || !config.bridgeToken) {
    socket.destroy()
    return
  }
  webSockets.handleUpgrade(request, socket, head, (client) => {
    client.once('message', (raw) => {
      let message: { type?: string; docId?: string; token?: string; pairingId?: string }
      try { message = JSON.parse(raw.toString()) } catch { client.close(1008, 'invalid registration'); return }
      const accepted = message.type === 'register'
        ? !!message.docId && !!message.token && bridge.register(client, message.docId, message.token, config.bridgeToken!, config.allowedDocIds)
        : message.type === 'pair' && !!message.docId && !!message.pairingId && bridge.attachPairing(client, message.pairingId, message.docId)
      if (!accepted) {
        client.close(1008, 'bridge registration rejected')
      }
    })
  })
})

httpServer.listen(config.port, config.host, () => console.error(`bento MCP adapter listening on ${config.host}:${config.port}/mcp`))
