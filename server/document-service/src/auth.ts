import { timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { ServiceConfig } from './config.js'

export type AuthFailure = {
  status: 401 | 503
  code: 'auth_not_configured' | 'missing_authorization' | 'invalid_authorization'
  message: string
}

export function authenticate(request: FastifyRequest, config: ServiceConfig): string | AuthFailure {
  if (!config.apiToken) {
    return {
      status: 503,
      code: 'auth_not_configured',
      message: 'Document service authentication is not configured.',
    }
  }

  const header = request.headers.authorization
  if (!header) {
    return {
      status: 401,
      code: 'missing_authorization',
      message: 'A bearer token is required.',
    }
  }

  const match = /^Bearer (.+)$/.exec(header)
  if (!match) {
    return {
      status: 401,
      code: 'invalid_authorization',
      message: 'Authorization must use the Bearer scheme.',
    }
  }

  const provided = Buffer.from(match[1])
  const expected = Buffer.from(config.apiToken)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return {
      status: 401,
      code: 'invalid_authorization',
      message: 'The bearer token is invalid.',
    }
  }

  return config.apiSubject
}
