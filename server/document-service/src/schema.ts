import { z } from 'zod'

const base64url = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'must be base64url')
const sha256 = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'must be a base64url SHA-256 digest')
const docId = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/, 'contains invalid characters')
const format = z.string().min(1).max(100).regex(/^bento\//, 'must be a bento document format')

export const encryptedMetadataSchema = z.object({
  ciphertext: base64url,
  nonce: base64url,
  version: z.number().int().positive(),
})

export const wrappedVaultKeySchema = z.object({
  ciphertext: base64url,
  salt: base64url,
  nonce: base64url,
  version: z.number().int().positive(),
})

export const createVaultKeySchema = z.object({
  wrappedKey: wrappedVaultKeySchema,
})

const encryptedSnapshotSchema = z.object({
  ciphertext: base64url,
  sha256,
  byteSize: z.number().int().nonnegative().optional(),
})

export const createDocumentSchema = z.object({
  docId,
  format,
  metadata: encryptedMetadataSchema,
  initialVersion: encryptedSnapshotSchema,
})

export const createVersionSchema = encryptedSnapshotSchema.extend({
  parentVersionId: z.string().uuid().nullable().optional(),
  labelCiphertext: base64url.optional(),
})

export const startSessionSchema = z.object({
  relayRoom: z.string().url().max(2048),
  sessionId: z.string().uuid().optional(),
})

export const recoverySchema = encryptedSnapshotSchema.extend({
  expiresAt: z.string().datetime({ offset: true }),
})

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type CreateVersionInput = z.infer<typeof createVersionSchema>
export type StartSessionInput = z.infer<typeof startSessionSchema>
export type RecoveryInput = z.infer<typeof recoverySchema>
export type WrappedVaultKey = z.infer<typeof wrappedVaultKeySchema>
export type CreateVaultKeyInput = z.infer<typeof createVaultKeySchema>

export function decodeBase64url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}
