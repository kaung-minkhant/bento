import type { AdapterConfig } from './config.js'

export class DocumentServiceClient {
  constructor(private readonly config: AdapterConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.config.documentServiceUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.config.documentServiceToken}`,
        accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    const body = await response.json().catch(() => null) as T | { error?: string; message?: string } | null
    if (!response.ok) {
      const error = body && typeof body === 'object' && 'message' in body ? body.message : undefined
      throw new Error(`Document service ${response.status}: ${error ?? 'request failed'}`)
    }
    return body as T
  }

  listDocuments(limit: number, cursor?: string) {
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor) query.set('cursor', cursor)
    return this.request<{ documents: unknown[]; nextCursor?: string | null }>(`/api/v1/documents?${query}`)
  }

  getDocument(docId: string) {
    return this.request(`/api/v1/documents/${encodeURIComponent(docId)}`)
  }

  listVersions(docId: string) {
    return this.request(`/api/v1/documents/${encodeURIComponent(docId)}/versions`)
  }

  startSession(docId: string, relayRoom: string, sessionId?: string) {
    return this.request(`/api/v1/documents/${encodeURIComponent(docId)}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relayRoom, ...(sessionId ? { sessionId } : {}) }),
    })
  }

  closeSession(docId: string, sessionId: string) {
    return this.request(`/api/v1/documents/${encodeURIComponent(docId)}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  }

  deleteDocument(docId: string) {
    return this.request(`/api/v1/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
  }
}
