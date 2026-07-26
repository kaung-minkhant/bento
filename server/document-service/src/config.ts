import { z } from 'zod'

const configSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8789),
  BENTO_API_TOKEN: z.string().min(1).optional(),
  BENTO_API_SUBJECT: z.string().min(1).default('api-user'),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_AUDIENCE: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
})

export type ServiceConfig = {
  host: string
  port: number
  apiToken?: string
  apiSubject: string
  oidcIssuerUrl?: string
  oidcClientId?: string
  oidcAudience?: string
  databaseUrl: string
  s3Endpoint: string
  s3Region: string
  s3Bucket: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  s3ForcePathStyle: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const parsed = configSchema.parse(env)
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    apiToken: parsed.BENTO_API_TOKEN,
    apiSubject: parsed.BENTO_API_SUBJECT,
    oidcIssuerUrl: parsed.OIDC_ISSUER_URL?.replace(/\/$/, ''),
    oidcClientId: parsed.OIDC_CLIENT_ID,
    oidcAudience: parsed.OIDC_AUDIENCE,
    databaseUrl: parsed.DATABASE_URL,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3Region: parsed.S3_REGION,
    s3Bucket: parsed.S3_BUCKET,
    s3AccessKeyId: parsed.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE === 'true',
  }
}
