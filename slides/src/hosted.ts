// Hosted document client. The service receives only an opaque encrypted
// envelope; document HTML and library metadata are encrypted in this browser.

export type HostedMetadata = {
  title: string
  format: string
  keywords?: string
}

export type HostedDocument = {
  docId: string
  ownerSubject: string
  format: string
  currentVersionId: string | null
  metadata: { ciphertext: string; nonce: string; version: number }
  role: 'owner' | 'editor' | 'reader'
  createdAt: string
  updatedAt: string
}

export type HostedVersion = {
  versionId: string
  docId: string
  ciphertextSha256: string
  byteSize: number
  createdBySubject: string
  parentVersionId: string | null
  labelCiphertext: string | null
  createdAt: string
}

export class HostedError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
let hostedPassword: string | null = null

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 300_000 },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptPayload(value: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key, value))
  return { salt: b64url(salt), iv: b64url(iv), data: b64url(encrypted) }
}

async function decryptPayload(envelope: { salt: string; iv: string; data: string }, password: string): Promise<Uint8Array> {
  const key = await deriveKey(password, fromB64url(envelope.salt))
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(envelope.iv) as BufferSource }, key, fromB64url(envelope.data) as BufferSource))
}

function requirePassword(): string {
  if (!hostedPassword) {
    const value = window.prompt('Hosted document password')
    if (!value) throw new HostedError(0, 'password_required', 'A hosted document password is required.')
    hostedPassword = value
  }
  return hostedPassword
}

async function encryptedDocument(html: string, metadata: HostedMetadata) {
  const password = requirePassword()
  const documentEnvelope = await encryptPayload(textEncoder.encode(html), password)
  const metadataEnvelope = await encryptPayload(textEncoder.encode(JSON.stringify(metadata)), password)
  const body = textEncoder.encode(JSON.stringify({ format: 'bento/hosted', v: 1, ...documentEnvelope }))
  const digest = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', body)))
  return {
    ciphertext: b64url(body),
    sha256: digest,
    byteSize: body.byteLength,
    metadata: { ciphertext: metadataEnvelope.data, nonce: metadataEnvelope.iv, version: 1 },
  }
}

async function decryptDocument(body: ArrayBuffer): Promise<string> {
  const password = requirePassword()
  const envelope = JSON.parse(textDecoder.decode(new Uint8Array(body))) as {
    format: string; v: number; salt: string; iv: string; data: string
  }
  if (envelope.format !== 'bento/hosted' || envelope.v !== 1) {
    throw new HostedError(0, 'invalid_blob', 'The hosted document envelope is invalid.')
  }
  return textDecoder.decode(await decryptPayload(envelope, password))
}

function storageValue(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function setStorageValue(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage is optional */ }
}

export function getHostedToken(): string | null {
  return storageValue('bento-hosted-token')
}

export function setHostedToken(token: string | null) {
  if (token) setStorageValue('bento-hosted-token', token)
  else {
    try { localStorage.removeItem('bento-hosted-token') } catch { /* storage is optional */ }
  }
}

export function setHostedPassword(password: string | null) {
  hostedPassword = password
}

function baseUrl(): string {
  return storageValue('bento-hosted-api-url') || `${location.origin}/api/v1`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getHostedToken()
  if (!token) throw new HostedError(0, 'token_required', 'A hosted document API token is required.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string; message?: string }
    throw new HostedError(response.status, error.error || 'request_failed', error.message || response.statusText)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function createHostedDocument(docId: string, format: string, metadata: HostedMetadata, html: string): Promise<HostedDocument> {
  const encrypted = await encryptedDocument(html, metadata)
  return request<HostedDocument>('/documents', {
    method: 'POST',
    body: JSON.stringify({ docId, format, metadata: encrypted.metadata, initialVersion: encrypted }),
  })
}

export async function listHostedDocuments(): Promise<HostedDocument[]> {
  const result = await request<{ documents: HostedDocument[]; nextCursor: string | null }>('/documents')
  return result.documents
}

export async function getHostedDocument(docId: string): Promise<HostedDocument> {
  return request<HostedDocument>(`/documents/${encodeURIComponent(docId)}`)
}

export async function openHostedDocument(docId: string): Promise<{ document: HostedDocument; html: string }> {
  const document = await getHostedDocument(docId)
  if (!document.currentVersionId) throw new HostedError(0, 'version_missing', 'The hosted document has no durable version.')
  const token = getHostedToken()
  if (!token) throw new HostedError(0, 'token_required', 'A hosted document API token is required.')
  const response = await fetch(`${baseUrl()}/documents/${encodeURIComponent(docId)}/versions/${document.currentVersionId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new HostedError(response.status, 'download_failed', 'The hosted document could not be downloaded.')
  return { document, html: await decryptDocument(await response.arrayBuffer()) }
}

export async function saveHostedVersion(
  docId: string, parentVersionId: string, format: string, metadata: HostedMetadata, html: string,
): Promise<HostedVersion> {
  void format
  const encrypted = await encryptedDocument(html, metadata)
  return request<HostedVersion>(`/documents/${encodeURIComponent(docId)}/versions`, {
    method: 'POST',
    body: JSON.stringify({ ...encrypted, parentVersionId }),
  })
}
