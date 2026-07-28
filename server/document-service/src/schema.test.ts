import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentSchema, createVaultKeySchema, createVersionSchema, startSessionSchema } from './schema.js'

const valid = {
  docId: '8e8f3f26-15ad-4c6c-8b31-2cc1e3e651f1',
  format: 'bento/slides',
  metadata: { ciphertext: 'bWV0YQ', nonce: 'bm9uY2U', version: 1 },
  initialVersion: {
    ciphertext: 'YmxvYg',
    sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    byteSize: 4,
  },
}

test('accepts the encrypted create payload shape', () => {
  assert.equal(createDocumentSchema.safeParse(valid).success, true)
})

test('requires a UUID parent for version writes when supplied', () => {
  assert.equal(createVersionSchema.safeParse({ ...valid.initialVersion, parentVersionId: 'not-a-uuid' }).success, false)
  assert.equal(createVersionSchema.safeParse({ ...valid.initialVersion, parentVersionId: valid.docId }).success, true)
})

test('accepts an opaque wrapped vault key', () => {
  assert.equal(createVaultKeySchema.safeParse({
    wrappedKey: { ciphertext: 'Y2lwaGVydGV4dA', salt: 'c2FsdA', nonce: 'bm9uY2U', version: 1 },
  }).success, true)
})

test('accepts a scoped relay session request', () => {
  assert.equal(startSessionSchema.safeParse({ relayRoom: 'https://bento-sync.example/d/room' }).success, true)
  assert.equal(startSessionSchema.safeParse({ relayRoom: 'not-a-url' }).success, false)
})
