export type AdapterConfig = {
  documentServiceUrl: string
  documentServiceToken: string
  bridgeToken?: string
  host: string
  port: number
  allowedDocIds: Set<string>
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AdapterConfig {
  const documentServiceUrl = env.DOCUMENT_SERVICE_URL?.replace(/\/$/, '')
  const documentServiceToken = env.DOCUMENT_SERVICE_TOKEN
  if (!documentServiceUrl) throw new Error('DOCUMENT_SERVICE_URL is required')
  if (!documentServiceToken) throw new Error('DOCUMENT_SERVICE_TOKEN is required')
  const port = Number(env.PORT ?? '8790')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port')
  const allowedDocIds = new Set((env.MCP_ALLOWED_DOC_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean))
  return { documentServiceUrl, documentServiceToken, bridgeToken: env.BENTO_AGENT_BRIDGE_TOKEN, host: env.HOST ?? '127.0.0.1', port, allowedDocIds }
}
