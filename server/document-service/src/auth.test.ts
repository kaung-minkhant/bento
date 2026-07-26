import test from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyRequest } from 'fastify'
import { authenticate } from './auth.js'
import type { ServiceConfig } from './config.js'

const config = {
  host: '127.0.0.1',
  port: 8789,
  apiToken: 'test-token',
  apiSubject: 'test-subject',
  databaseUrl: 'postgres://unused',
  s3Endpoint: 'http://localhost:8333',
  s3Region: 'us-east-1',
  s3Bucket: 'bento-documents',
  s3AccessKeyId: 'access',
  s3SecretAccessKey: 'secret',
  s3ForcePathStyle: true,
} satisfies ServiceConfig

const request = (authorization?: string) => ({
  headers: authorization ? { authorization } : {},
}) as FastifyRequest

test('authenticates the configured bearer token', async () => {
  assert.equal(await authenticate(request('Bearer test-token'), config), 'test-subject')
})

test('rejects missing and invalid bearer tokens', async () => {
  assert.equal((await authenticate(request(), config) as { code: string }).code, 'missing_authorization')
  assert.equal((await authenticate(request('Bearer wrong'), config) as { code: string }).code, 'invalid_authorization')
})

test('does not accept an identity header when auth is unconfigured', async () => {
  const unconfigured = { ...config, apiToken: undefined }
  const result = await authenticate({ headers: { 'x-bento-subject': 'attacker' } } as unknown as FastifyRequest, unconfigured)
  assert.equal(typeof result, 'object')
  assert.equal((result as { status: number; code: string }).status, 503)
  assert.equal((result as { status: number; code: string }).code, 'auth_not_configured')
})
