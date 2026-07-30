import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
type Pairing = { id: string; code: string; docId: string; expiresAt: number; claimed: boolean; socket?: WebSocket }

const MAX_BRIDGE_RESPONSE_BYTES = 12 * 1024 * 1024

export class BrowserBridge {
  private readonly clients = new Map<string, WebSocket>()
  private readonly pending = new Map<string, Pending>()
  private readonly pairings = new Map<string, Pairing>()

  constructor(private readonly requestTimeoutMs = 30_000) {}

  createPairing(docId: string, allowedDocIds: Set<string>): { pairingId: string; code: string; expiresAt: number } {
    if (allowedDocIds.size > 0 && !allowedDocIds.has(docId)) throw new Error('This MCP adapter is not authorized for that document.')
    const pairing = { id: randomUUID(), code: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(), docId, expiresAt: Date.now() + 5 * 60_000, claimed: false }
    this.pairings.set(pairing.id, pairing)
    return { pairingId: pairing.id, code: pairing.code, expiresAt: pairing.expiresAt }
  }

  attachPairing(socket: WebSocket, pairingId: string, docId: string): boolean {
    const pairing = this.pairings.get(pairingId)
    if (!pairing || pairing.expiresAt <= Date.now() || pairing.docId !== docId || pairing.socket) return false
    pairing.socket = socket
    socket.on('message', (raw) => this.receive(docId, raw.toString()))
    socket.on('close', () => {
      if (this.clients.get(docId) === socket) this.clients.delete(docId)
      if (pairing.socket === socket) pairing.socket = undefined
      this.rejectPending(docId, 'The browser bridge disconnected.')
    })
    if (pairing.claimed) this.activatePairing(pairing)
    else socket.send(JSON.stringify({ type: 'waiting', docId, expiresAt: pairing.expiresAt }))
    return true
  }

  claimPairing(code: string): { docId: string } {
    const pairing = [...this.pairings.values()].find((value) => value.code === code.trim().toUpperCase())
    if (!pairing || pairing.expiresAt <= Date.now()) throw new Error('That pairing code is invalid or expired.')
    pairing.claimed = true
    this.activatePairing(pairing)
    return { docId: pairing.docId }
  }

  register(socket: WebSocket, docId: string, token: string, expectedToken: string, allowedDocIds: Set<string>): boolean {
    if (token !== expectedToken || (allowedDocIds.size > 0 && !allowedDocIds.has(docId))) return false
    this.clients.get(docId)?.close(1000, 'replaced by newer browser connection')
    this.clients.set(docId, socket)
    socket.on('message', (raw) => this.receive(docId, raw.toString()))
    socket.on('close', () => {
      if (this.clients.get(docId) === socket) this.clients.delete(docId)
      this.rejectPending(docId, 'The browser bridge disconnected.')
    })
    socket.send(JSON.stringify({ type: 'registered', docId }))
    return true
  }

  request(docId: string, operation: string, json?: string, params?: Record<string, unknown>, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    const socket = this.clients.get(docId)
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('No browser is connected for this document.'))
    const requestId = `${docId}:${randomUUID()}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('The browser bridge request timed out.'))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer })
      socket.send(JSON.stringify({ type: 'request', requestId, operation, ...(json === undefined ? {} : { json }), ...(params === undefined ? {} : { params }) }))
    })
  }

  has(docId: string): boolean {
    const socket = this.clients.get(docId)
    return !!socket && socket.readyState === WebSocket.OPEN
  }

  private receive(docId: string, raw: string) {
    if (Buffer.byteLength(raw) > MAX_BRIDGE_RESPONSE_BYTES) {
      this.rejectPending(docId, 'The browser bridge response exceeded the 12 MB limit.')
      return
    }
    let message: { type?: string; requestId?: string; ok?: boolean; value?: unknown; error?: string }
    try { message = JSON.parse(raw) } catch { return }
    if (message.type !== 'response' || typeof message.requestId !== 'string' || !message.requestId.startsWith(`${docId}:`)) return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error || 'The browser bridge rejected the request.'))
  }

  private activatePairing(pairing: Pairing) {
    if (!pairing.socket) return
    this.clients.set(pairing.docId, pairing.socket)
    pairing.socket.send(JSON.stringify({ type: 'paired', docId: pairing.docId }))
  }

  private rejectPending(docId: string, message: string) {
    for (const [requestId, pending] of this.pending) {
      if (requestId.startsWith(`${docId}:`)) {
        this.pending.delete(requestId)
        clearTimeout(pending.timer)
        pending.reject(new Error(message))
      }
    }
  }
}
