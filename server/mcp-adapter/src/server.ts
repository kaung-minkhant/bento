import { createServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadConfig } from './config.js'
import { DocumentServiceClient } from './client.js'
import { createMcpServer } from './tools.js'

const config = loadConfig()
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
  const server = createMcpServer(config, new DocumentServiceClient(config))
  try {
    await server.connect(transport)
    await transport.handleRequest(request, response)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'mcp_error' }))
  }
})

httpServer.listen(config.port, config.host, () => console.error(`bento MCP adapter listening on ${config.host}:${config.port}/mcp`))
