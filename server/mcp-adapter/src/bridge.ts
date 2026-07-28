import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

export class BrowserBridge {
  private readonly clients = new Map<string, WebSocket>()
  private readonly pending = new Map<string, Pending>()

  register(socket: WebSocket, docId: string, token: string, expectedToken: string, allowedDocIds: Set<string>): boolean {
    if (token !== expectedToken || (allowedDocIds.size > 0 && !allowedDocIds.has(docId))) return false
    this.clients.get(docId)?.close(1000, 'replaced by newer browser connection')
    this.clients.set(docId, socket)
    socket.on('message', (raw) => this.receive(docId, raw.toString()))
    socket.on('close', () => {
      if (this.clients.get(docId) === socket) this.clients.delete(docId)
      for (const [requestId, pending] of this.pending) {
        if (requestId.startsWith(`${docId}:`)) {
          this.pending.delete(requestId)
          pending.reject(new Error('The browser bridge disconnected.'))
        }
      }
    })
    socket.send(JSON.stringify({ type: 'registered', docId }))
    return true
  }

  request(docId: string, operation: 'read_document' | 'replace_document', json?: string): Promise<unknown> {
    const socket = this.clients.get(docId)
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('No browser is connected for this document.'))
    const requestId = `${docId}:${randomUUID()}`
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      socket.send(JSON.stringify({ type: 'request', requestId, operation, ...(json === undefined ? {} : { json }) }))
    })
  }

  has(docId: string): boolean {
    const socket = this.clients.get(docId)
    return !!socket && socket.readyState === WebSocket.OPEN
  }

  private receive(docId: string, raw: string) {
    let message: { type?: string; requestId?: string; ok?: boolean; value?: unknown; error?: string }
    try { message = JSON.parse(raw) } catch { return }
    if (message.type !== 'response' || typeof message.requestId !== 'string' || !message.requestId.startsWith(`${docId}:`)) return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error || 'The browser bridge rejected the request.'))
  }
}
