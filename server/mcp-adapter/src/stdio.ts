import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { DocumentServiceClient } from './client.js'
import { createMcpServer } from './tools.js'

const config = loadConfig()
const server = createMcpServer(config, new DocumentServiceClient(config))
await server.connect(new StdioServerTransport())
