import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { BrowserBridge } from './bridge.js'

class FakeSocket extends EventEmitter {
  readonly sent: string[] = []
  readonly readyState = WebSocket.OPEN
  send(value: string) { this.sent.push(value) }
  close() { this.emit('close') }
}

test('browser bridge routes a scoped request and response', async () => {
  const socket = new FakeSocket()
  const bridge = new BrowserBridge()
  assert.equal(bridge.register(socket as unknown as WebSocket, 'doc-1', 'bridge-secret', 'bridge-secret', new Set(['doc-1'])), true)
  assert.deepEqual(JSON.parse(socket.sent[0]), { type: 'registered', docId: 'doc-1' })

  const request = bridge.request('doc-1', 'read_document')
  const message = JSON.parse(socket.sent[1]) as { requestId: string; operation: string }
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'response', requestId: message.requestId, ok: true, value: { operation: message.operation } })))
  assert.deepEqual(await request, { operation: 'read_document' })
})

test('browser bridge rejects an unregistered document', async () => {
  const socket = new FakeSocket()
  const bridge = new BrowserBridge()
  assert.equal(bridge.register(socket as unknown as WebSocket, 'doc-1', 'wrong', 'bridge-secret', new Set(['doc-1'])), false)
  await assert.rejects(() => bridge.request('doc-1', 'read_document'), /No browser is connected/)
})

test('browser bridge times out a request that receives no response', async () => {
  const socket = new FakeSocket()
  const bridge = new BrowserBridge(5)
  assert.equal(bridge.register(socket as unknown as WebSocket, 'doc-1', 'bridge-secret', 'bridge-secret', new Set(['doc-1'])), true)
  await assert.rejects(() => bridge.request('doc-1', 'render_slide'), /timed out/)
})
