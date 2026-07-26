import { timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { ServiceConfig } from './config.js'

export type AuthFailure = {
  status: 401 | 503
  code: 'auth_not_configured' | 'missing_authorization' | 'invalid_authorization'
  message: string
}

let oidcKeys: ReturnType<typeof createRemoteJWKSet> | null = null

async function authenticateOidc(token: string, config: ServiceConfig): Promise<string | null> {
  if (!config.oidcIssuerUrl || !config.oidcAudience) return null
  try {
    const discovery = await fetch(`${config.oidcIssuerUrl}/.well-known/openid-configuration`)
    if (!discovery.ok) return null
    const metadata = await discovery.json() as { jwks_uri?: string }
    if (!metadata.jwks_uri) return null
    oidcKeys ??= createRemoteJWKSet(new URL(metadata.jwks_uri))
    const verified = await jwtVerify(token, oidcKeys, {
      issuer: config.oidcIssuerUrl,
      audience: config.oidcAudience,
    })
    return typeof verified.payload.sub === 'string' ? verified.payload.sub : null
  } catch {
    return null
  }
}

export async function authenticate(request: FastifyRequest, config: ServiceConfig): Promise<string | AuthFailure> {
  if (!config.apiToken && (!config.oidcIssuerUrl || !config.oidcAudience)) {
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
  if (config.apiToken) {
    const expected = Buffer.from(config.apiToken)
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return config.apiSubject
    }
  }

  const subject = await authenticateOidc(match[1], config)
  if (subject) return subject
  return {
    status: 401,
    code: 'invalid_authorization',
    message: 'The bearer token is invalid.',
  }
}
