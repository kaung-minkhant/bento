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
const httpServer = createServer(async (request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, service: 'bento-mcp-adapter' }))
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
      let message: { type?: string; docId?: string; token?: string }
      try { message = JSON.parse(raw.toString()) } catch { client.close(1008, 'invalid registration'); return }
      if (message.type !== 'register' || !message.docId || !message.token || !bridge.register(client, message.docId, message.token, config.bridgeToken!, config.allowedDocIds)) {
        client.close(1008, 'bridge registration rejected')
      }
    })
  })
})

httpServer.listen(config.port, config.host, () => console.error(`bento MCP adapter listening on ${config.host}:${config.port}/mcp`))
