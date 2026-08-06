// Hosted document client. The service receives only an opaque encrypted
// envelope; document HTML and library metadata are encrypted in this browser.

import { t } from './i18n'
import { hostedRoute } from './base-path'

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

export type HostedSession = {
  sessionId: string
  docId: string
  relayRoom: string
  createdBySubject: string
  createdAt: string
  lastSeenAt: string
  closedAt: string | null
}

export type HostedOidcConfig = { issuer: string; clientId: string; audience: string }
export type HostedProfile = { sub: string; name?: string; email?: string; preferredUsername?: string }
type WrappedVaultKey = { ciphertext: string; salt: string; nonce: string; version: number }

export class HostedError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
let hostedPassword: string | null = null
let oidcConfigPromise: Promise<HostedOidcConfig | null> | null = null
const hostedVaultSessionKey = 'bento-hosted-vault-key'

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

function requireHostedSecret(): string {
  if (!hostedPassword) throw new HostedError(0, 'vault_locked', 'The hosted vault is locked.')
  return hostedPassword
}

function askPassword(title: string, confirmation: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'ed-dialog ed-pwdialog'
    dialog.innerHTML =
      `<h2>${title}</h2>` +
      `<label>${t('Password')}<input type="password" class="pw1" autocomplete="current-password"></label>` +
      (confirmation ? `<label>${t('Confirm password')}<input type="password" class="pw2" autocomplete="new-password"></label>` : '') +
      `<div class="ed-pwerr"></div>` +
      `<div class="ed-dialog-actions"><button class="cancel">${t('Cancel')}</button>` +
      `<button class="ok ed-primary">${confirmation ? t('Set password') : t('Unlock')}</button></div>`
    document.body.appendChild(dialog)
    const first = dialog.querySelector<HTMLInputElement>('.pw1')!
    const second = dialog.querySelector<HTMLInputElement>('.pw2')
    const error = dialog.querySelector<HTMLElement>('.ed-pwerr')!
    const done = (value: string | null) => {
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    dialog.querySelector('.cancel')!.addEventListener('click', () => done(null))
    dialog.querySelector('.ok')!.addEventListener('click', () => {
      if (!first.value || (second && first.value !== second.value)) {
        error.textContent = t('Passwords do not match')
        return
      }
      done(first.value)
    })
    dialog.addEventListener('cancel', () => done(null), { once: true })
    dialog.showModal()
    first.focus()
  })
}

async function requireLegacyPassword(): Promise<string> {
  const value = await askPassword(t('Enter the password for this older hosted document'), false)
  if (!value) throw new HostedError(0, 'password_required', 'A hosted document password is required.')
  return value
}

async function wrapVaultKey(rawKey: Uint8Array, recoveryPassword: string): Promise<WrappedVaultKey> {
  const envelope = await encryptPayload(rawKey, recoveryPassword)
  return { ciphertext: envelope.data, salt: envelope.salt, nonce: envelope.iv, version: 1 }
}

async function unwrapVaultKey(wrappedKey: WrappedVaultKey, recoveryPassword: string): Promise<string> {
  const rawKey = await decryptPayload(
    { salt: wrappedKey.salt, iv: wrappedKey.nonce, data: wrappedKey.ciphertext },
    recoveryPassword,
  )
  if (rawKey.byteLength !== 32) throw new Error('Invalid hosted vault key')
  return b64url(rawKey)
}

async function encryptedDocument(html: string, metadata: HostedMetadata) {
  await ensureHostedVaultKey()
  const password = requireHostedSecret()
  const documentEnvelope = await encryptPayload(textEncoder.encode(html), password)
  const metadataEnvelope = await encryptPayload(textEncoder.encode(JSON.stringify(metadata)), password)
  const body = textEncoder.encode(JSON.stringify({ format: 'bento/hosted', v: 1, ...documentEnvelope }))
  const digest = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', body)))
  return {
    ciphertext: b64url(body),
    sha256: digest,
    byteSize: body.byteLength,
    // Keep the salt with the encrypted metadata. Older records stored only the
    // ciphertext and IV, which made their titles impossible to recover after
    // listing without downloading every document.
    metadata: {
      ciphertext: b64url(textEncoder.encode(JSON.stringify(metadataEnvelope))),
      nonce: metadataEnvelope.iv,
      version: 1,
    },
  }
}

export async function decryptHostedMetadata(metadata: HostedDocument['metadata']): Promise<HostedMetadata | null> {
  try {
    const envelope = JSON.parse(textDecoder.decode(fromB64url(metadata.ciphertext))) as {
      salt?: string; iv?: string; data?: string
    }
    if (!envelope.salt || !envelope.iv || !envelope.data) return null
    if (!hostedPassword) return null
    const plain = await decryptPayload({ salt: envelope.salt, iv: envelope.iv, data: envelope.data }, hostedPassword)
    return JSON.parse(textDecoder.decode(plain)) as HostedMetadata
  } catch {
    return null
  }
}

async function decryptDocument(body: ArrayBuffer): Promise<string> {
  const envelope = JSON.parse(textDecoder.decode(new Uint8Array(body))) as {
    format: string; v: number; salt: string; iv: string; data: string
  }
  if (envelope.format !== 'bento/hosted' || envelope.v !== 1) {
    throw new HostedError(0, 'invalid_blob', 'The hosted document envelope is invalid.')
  }
  await ensureHostedVaultKey()
  try {
    return textDecoder.decode(await decryptPayload(envelope, requireHostedSecret()))
  } catch {
    // Older hosted documents used an individual password. Keep them readable
    // and migrate them to the account vault key on the next save.
    return textDecoder.decode(await decryptPayload(envelope, await requireLegacyPassword()))
  }
}

function storageValue(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function sessionValue(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function setSessionValue(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch { /* session storage is optional */ }
}

function restoreHostedVaultKey() {
  if (!hostedPassword) hostedPassword = sessionValue(hostedVaultSessionKey)
}

function rememberHostedVaultKey(value: string) {
  hostedPassword = value
  setSessionValue(hostedVaultSessionKey, value)
}

function profileFromClaims(claims: Record<string, unknown>): HostedProfile | null {
  if (typeof claims.sub !== 'string') return null
  return {
    sub: claims.sub,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    preferredUsername: typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined,
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const encoded = token.split('.')[1]
    if (!encoded) return null
    return JSON.parse(textDecoder.decode(fromB64url(encoded))) as Record<string, unknown>
  } catch { return null }
}

function setStorageValue(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage is optional */ }
}

export function getHostedToken(): string | null {
  return sessionValue('bento-oidc-access-token') || storageValue('bento-hosted-token')
}

export function setHostedToken(token: string | null) {
  if (token) setStorageValue('bento-hosted-token', token)
  else {
    try { localStorage.removeItem('bento-hosted-token') } catch { /* storage is optional */ }
  }
}

export function setHostedPassword(password: string | null) {
  hostedPassword = password
  setSessionValue(hostedVaultSessionKey, password)
}

export function hasHostedPassword(): boolean {
  restoreHostedVaultKey()
  return hostedPassword !== null
}

export type HostedVaultState = 'setup' | 'unlock' | 'ready'

export async function getHostedVaultState(): Promise<HostedVaultState> {
  restoreHostedVaultKey()
  if (hostedPassword) return 'ready'
  const result = await request<{ wrappedKey: WrappedVaultKey | null }>('/vault/key')
  return result.wrappedKey ? 'unlock' : 'setup'
}

export async function ensureHostedVaultKey(): Promise<void> {
  restoreHostedVaultKey()
  if (hostedPassword) return
  const result = await request<{ wrappedKey: WrappedVaultKey | null }>('/vault/key')
  if (result.wrappedKey) {
    const recoveryPassword = await askPassword(t('Enter your hosted vault recovery password'), false)
    if (!recoveryPassword) throw new HostedError(0, 'recovery_required', 'A hosted vault recovery password is required.')
    try {
      rememberHostedVaultKey(await unwrapVaultKey(result.wrappedKey, recoveryPassword))
    } catch {
      throw new HostedError(0, 'recovery_invalid', 'The hosted vault recovery password is incorrect.')
    }
    return
  }

  const recoveryPassword = await askPassword(t('Create a hosted vault recovery password'), true)
  if (!recoveryPassword) throw new HostedError(0, 'recovery_required', 'A hosted vault recovery password is required.')
  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  const wrappedKey = await wrapVaultKey(rawKey, recoveryPassword)
  await request('/vault/key', { method: 'POST', body: JSON.stringify({ wrappedKey }) })
  rememberHostedVaultKey(b64url(rawKey))
}

export async function getHostedOidcConfig(): Promise<HostedOidcConfig | null> {
  oidcConfigPromise ??= fetch(`${baseUrl()}/auth/config`)
    .then(async (response) => response.ok ? await response.json() as HostedOidcConfig : null)
    .catch(() => null)
  return oidcConfigPromise
}

function redirectUri(): string {
  return `${location.origin}${location.pathname}`
}

function randomString(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function codeChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(verifier))))
}

export async function signInHosted(): Promise<void> {
  const config = await getHostedOidcConfig()
  if (!config) throw new HostedError(0, 'oidc_not_configured', 'Zitadel login is not configured on the document service.')
  const discoveryResponse = await fetch(`${config.issuer}/.well-known/openid-configuration`)
  if (!discoveryResponse.ok) throw new HostedError(0, 'oidc_unavailable', 'Zitadel discovery could not be loaded.')
  const discovery = await discoveryResponse.json() as { authorization_endpoint?: string }
  if (!discovery.authorization_endpoint) throw new HostedError(0, 'oidc_invalid', 'Zitadel has no authorization endpoint.')
  const verifier = randomString(48)
  setSessionValue('bento-oidc-login', JSON.stringify({ state: randomString(), verifier }))
  const login = JSON.parse(sessionValue('bento-oidc-login')!) as { state: string; verifier: string }
  const audienceScope = `urn:zitadel:iam:org:project:id:${config.audience}:aud`
  const params = new URLSearchParams({
    response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri(),
    scope: `openid profile email ${audienceScope}`, state: login.state,
    code_challenge: await codeChallenge(login.verifier), code_challenge_method: 'S256',
  })
  location.assign(`${discovery.authorization_endpoint}?${params}`)
}

export async function completeHostedSignIn(): Promise<boolean> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code && !params.get('error')) return false
  const saved = sessionValue('bento-oidc-login')
  setSessionValue('bento-oidc-login', null)
  if (params.get('error')) throw new HostedError(0, 'oidc_denied', 'Zitadel login was cancelled.')
  if (!saved || !state) throw new HostedError(0, 'oidc_state', 'The Zitadel login state is invalid.')
  const login = JSON.parse(saved) as { state: string; verifier: string }
  if (login.state !== state) throw new HostedError(0, 'oidc_state', 'The Zitadel login state is invalid.')
  const config = await getHostedOidcConfig()
  if (!config) throw new HostedError(0, 'oidc_not_configured', 'Zitadel login is not configured on the document service.')
  const discoveryResponse = await fetch(`${config.issuer}/.well-known/openid-configuration`)
  if (!discoveryResponse.ok) throw new HostedError(0, 'oidc_unavailable', 'Zitadel discovery could not be loaded.')
  const discovery = await discoveryResponse.json() as { token_endpoint?: string }
  if (!discovery.token_endpoint) throw new HostedError(0, 'oidc_invalid', 'Zitadel has no token endpoint.')
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
      code: code!, redirect_uri: redirectUri(), code_verifier: login.verifier }),
  })
  if (!response.ok) throw new HostedError(0, 'oidc_token', 'Zitadel did not issue an access token.')
  const token = await response.json() as { access_token?: string; id_token?: string }
  if (!token.access_token) throw new HostedError(0, 'oidc_token', 'Zitadel did not issue an access token.')
  setSessionValue('bento-oidc-access-token', token.access_token)
  if (token.id_token) setSessionValue('bento-oidc-id-token', token.id_token)
  await refreshHostedProfile()
  history.replaceState(null, '', `${location.pathname}${location.hash}`)
  window.dispatchEvent(new Event('bento:auth-changed'))
  return true
}

export function signOutHosted() {
  setSessionValue('bento-oidc-access-token', null)
  setSessionValue('bento-oidc-id-token', null)
  setSessionValue('bento-oidc-profile', null)
  setSessionValue(hostedVaultSessionKey, null)
  hostedPassword = null
  window.dispatchEvent(new Event('bento:auth-changed'))
}

export function isHostedOidcSignedIn(): boolean {
  return Boolean(sessionValue('bento-oidc-access-token'))
}

export function getHostedProfile(): HostedProfile | null {
  const saved = sessionValue('bento-oidc-profile')
  if (saved) {
    try { return JSON.parse(saved) as HostedProfile } catch { /* refresh below */ }
  }
  const token = sessionValue('bento-oidc-id-token') || sessionValue('bento-oidc-access-token')
  if (!token) return null
  const claims = decodeJwtPayload(token)
  return claims ? profileFromClaims(claims) : null
}

export async function refreshHostedProfile(): Promise<void> {
  const accessToken = sessionValue('bento-oidc-access-token')
  if (!accessToken) return
  const config = await getHostedOidcConfig()
  if (!config) return
  const discoveryResponse = await fetch(`${config.issuer}/.well-known/openid-configuration`)
  if (!discoveryResponse.ok) return
  const discovery = await discoveryResponse.json() as { userinfo_endpoint?: string }
  if (!discovery.userinfo_endpoint) return
  const response = await fetch(discovery.userinfo_endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) return
  const profile = profileFromClaims(await response.json() as Record<string, unknown>)
  if (!profile) return
  setSessionValue('bento-oidc-profile', JSON.stringify(profile))
  window.dispatchEvent(new Event('bento:auth-changed'))
}

function baseUrl(): string {
  // Hosted documents use the current origin. Vite proxies /api in development
  // and the production ingress serves the API under the same host, so a
  // persisted endpoint override can only create stale or cross-environment
  // authentication failures.
  return `${location.origin}${hostedRoute('/api/v1')}`
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

export async function deleteHostedDocument(docId: string): Promise<void> {
  await request<void>(`/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
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

export async function startHostedSession(docId: string, relayRoom: string, sessionId?: string): Promise<HostedSession> {
  return request<HostedSession>(`/documents/${encodeURIComponent(docId)}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ relayRoom, ...(sessionId ? { sessionId } : {}) }),
  })
}

export async function closeHostedSession(docId: string, sessionId: string): Promise<HostedSession> {
  return request<HostedSession>(`/documents/${encodeURIComponent(docId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}
