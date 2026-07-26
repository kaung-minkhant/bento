#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Focused tests for encrypted collaboration blob encoding and addressing.

import {
  MAX_BLOB,
  blobKey,
  bytesToDataUri,
  decodeBlob,
  encodeBlob,
  encodedSize,
  maxAssetBytes,
} from '../slides/src/sync/blobs.ts'

function ok(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const key = new Uint8Array(32).fill(7)
const otherKey = new Uint8Array(32).fill(8)
const small = Uint8Array.from({ length: 257 }, (_, i) => i & 0xff)

const encoded = await encodeBlob(key, small)
ok(encoded.length === encodedSize(small.length), 'encoded size matches the wire layout')
const decoded = await decodeBlob(key, encoded)
ok(!!decoded && bytesToDataUri(decoded, 'image/png').startsWith('data:image/png;base64,'), 'round-trip decodes to a data URI')
ok(!!decoded && decoded.every((value, i) => value === small[i]), 'round-trip preserves every byte')

const tampered = encoded.slice()
tampered[tampered.length - 1] ^= 1
ok((await decodeBlob(key, tampered)) === null, 'tampering is rejected by the GCM tag')
ok((await decodeBlob(otherKey, encoded)) === null, 'a different room key cannot decrypt the blob')

const boundary = maxAssetBytes()
ok(encodedSize(boundary) <= MAX_BLOB, 'maximum plaintext fits the relay encoded-size limit')
ok(encodedSize(boundary + 1) > MAX_BLOB, 'plaintext above the maximum is rejected by encoded-size accounting')

const firstKey = await blobKey(key, small)
const sameKey = await blobKey(key, small)
const otherRoomKey = await blobKey(otherKey, small)
ok(firstKey === sameKey, 'identical content in one room deduplicates')
ok(firstKey !== otherRoomKey, 'identical content in different rooms gets a different key')

console.log('ALL PASS (9 blob checks)')
