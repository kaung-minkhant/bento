// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Boot sequence. Order matters: capture the pristine document BEFORE any DOM
// mutation — the captured copy is what gets re-serialized on save.

import './styles.css'
import { anim } from './anim'
import { configureApp, appConfig } from '../../kernel/src/app.ts'
import {
  capturePristine, readEmbeddedDoc, serializeFile, serializeAuto, downloadFile,
  suggestedFileName, parseEnvelope, decryptEnvelope, setEncryptionPassword,
} from './save'
import { APP_VERSION, checkForUpdates, buildUpdatedFile, applyUpdate } from './update'
import { i18nApi, t } from './i18n'
import { defaultText, emptySlide, newDoc, parseDoc, type BentoDoc } from './model'
import { starterDoc } from './starterdeck'
import { injectFonts } from './fonts'
import { Store } from './store'
import { Editor } from './editor/editor'
import { startPresentation } from './present'
import { SyncSession } from './sync/session'
import { onlineTransport, startSharing, stopSharing } from './sync/online'
import {
  createHostedDocument, deleteHostedDocument, getHostedToken, getHostedDocument, listHostedDocuments,
  openHostedDocument, saveHostedVersion, startHostedSession as registerHostedSession, closeHostedSession, decryptHostedMetadata, hasHostedPassword, setHostedPassword, setHostedToken,
  completeHostedSignIn, ensureHostedVaultKey, getHostedOidcConfig, getHostedProfile, getHostedVaultState, isHostedOidcSignedIn, refreshHostedProfile, signInHosted, signOutHosted,
} from './hosted'
import { docContentKey } from './autosave'
import { openHostedLibrary } from './hosted-library'

// Tell the kernel who this app is — must precede any kernel module use
// (window title suffix, save-picker label, update manifest + its `app` check).
configureApp({
  appId: 'bento-slides',
  appName: 'bento/slides',
  manifestUrl: 'https://bento.page/releases/slides/manifest.json',
})

capturePristine()

// Finish a PKCE callback before deciding whether this is the library page.
// The editor can still boot while the exchange is in flight on normal routes.
const hostedSignIn = completeHostedSignIn().catch((error) => {
  console.error(error)
  return false
})
void refreshHostedProfile().catch((error) => console.error(error))

// --- boot gates: password-encrypted files, read-only player files -----------

const embedded = readEmbeddedDoc()
const envelope = embedded ? parseEnvelope(embedded) : null
const isHostedLibraryEntry = location.protocol !== 'file:' && location.pathname === '/library'
const hostedDocQuery = location.protocol !== 'file:' && new URLSearchParams(location.search).get('doc')
if (isHostedLibraryEntry && !embedded && !envelope) {
  void hostedSignIn.then(() => bootHostedLibraryPage())
} else if (hostedDocQuery && !embedded && !envelope) {
  void loadHostedDocument(hostedDocQuery).then(({ doc, docId, versionId }) => {
    bootWith(doc, { docId, versionId })
  }).catch((error) => hostedLoadError(error))
} else if (envelope) {
  void passwordGate()
} else {
  bootWith(new URLSearchParams(location.search).get('new') === '1' ? newDoc() : (embedded && parseDoc(embedded)) || starterDoc())
}

/** Encrypted file: ask for the password (looping on failure), then boot. */
async function passwordGate() {
  const gate = document.createElement('div')
  gate.className = 'ed-pwgate'
  gate.innerHTML =
    `<div class="ed-pwcard"><div class="ed-pwmark">🔒</div>` +
    `<h1>${t('This file is encrypted.')}</h1>` +
    `<p>${t('Enter password to open this deck')}</p>` +
    `<input type="password" autocomplete="current-password">` +
    `<button>${t('Unlock')}</button><div class="ed-pwerr"></div></div>`
  document.body.appendChild(gate)
  document.getElementById('bento-splash')?.remove()
  const input = gate.querySelector('input')!
  const button = gate.querySelector('button')!
  const err = gate.querySelector<HTMLElement>('.ed-pwerr')!
  const tryUnlock = async () => {
    const pass = input.value
    if (!pass) return
    button.setAttribute('disabled', '')
    const json = await decryptEnvelope(envelope!, pass)
    button.removeAttribute('disabled')
    if (json === null) {
      err.textContent = t('Wrong password — try again')
      input.select()
      return
    }
    const doc = parseDoc(json)
    if (!doc) {
      err.textContent = t('Wrong password — try again')
      return
    }
    setEncryptionPassword(pass) // saves + updates keep writing encrypted
    gate.remove()
    bootWith(doc)
  }
  button.addEventListener('click', () => void tryUnlock())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void tryUnlock()
  })
  input.focus()
}

type HostedBoot = { docId: string; versionId: string | null }

function bootWith(doc: BentoDoc, hosted?: HostedBoot) {
  if (doc.readonly) playerMode(doc)
  else editorMode(doc, hosted)
}

async function loadHostedDocument(docId: string): Promise<HostedBoot & { doc: BentoDoc }> {
  const opened = await openHostedDocument(docId)
  const parsed = new DOMParser().parseFromString(opened.html, 'text/html')
  const body = parsed.getElementById('bento-doc')?.textContent?.trim()
  if (!body) throw new Error('Hosted file has no document block')
  const fileEnvelope = parseEnvelope(body)
  let json = body
  if (fileEnvelope) {
    const password = window.prompt('Document password')
    if (!password) throw new Error('Document password is required')
    const decrypted = await decryptEnvelope(fileEnvelope, password)
    if (!decrypted) throw new Error('Wrong document password')
    setEncryptionPassword(password)
    json = decrypted
  }
  const doc = parseDoc(json)
  if (!doc) throw new Error('Hosted file contains an invalid document')
  return { doc, docId: opened.document.docId, versionId: opened.document.currentVersionId }
}

function hostedLoadError(error: unknown) {
  document.getElementById('bento-splash')?.remove()
  const message = error instanceof Error ? error.message : t('Hosted open failed')
  const card = document.createElement('main')
  card.className = 'ed-hosted-library-signin'
  card.innerHTML = `<div class="ed-hosted-library-signin-card"><div class="ed-hosted-library-kicker">bento/vault</div>` +
    `<h1>${t('Hosted open failed')}</h1><p>${message}</p>` +
    `<button class="ed-hosted-library-action primary">${t('Back to hosted library')}</button></div>`
  card.querySelector('button')!.addEventListener('click', () => location.assign('/library'))
  document.body.appendChild(card)
}

const hostedProfileLabel = () => {
  const profile = getHostedProfile()
  return profile?.name || profile?.email || profile?.preferredUsername || profile?.sub || t('Signed in with Zitadel')
}

const listHostedLibraryDocuments = async () => {
  const documents = await listHostedDocuments()
  if (documents.length && !hasHostedPassword() && await getHostedVaultState() === 'unlock') {
    await ensureHostedVaultKey()
  }
  return Promise.all(documents.map(async (document) => ({
    ...document,
    displayMetadata: hasHostedPassword() ? await decryptHostedMetadata(document.metadata) : null,
  })))
}

function bootHostedLibraryPage() {
  document.title = `bento/vault — ${appConfig().appName}`
  document.getElementById('bento-splash')?.remove()
  if (!isHostedOidcSignedIn()) {
    const card = document.createElement('main')
    card.className = 'ed-hosted-library-signin'
    card.innerHTML = `<div class="ed-hosted-library-signin-card"><div class="ed-hosted-library-kicker">bento/vault</div>` +
      `<h1>${t('Your decks')}</h1><p>${t('Sign in with Zitadel to open your hosted deck library.')}</p>` +
      `<button class="ed-hosted-library-action primary">${t('Sign in with Zitadel')}</button></div>`
    card.querySelector('button')!.addEventListener('click', () => void signInHosted())
    document.body.appendChild(card)
    return
  }
  openHostedLibrary({
    profileLabel: hostedProfileLabel(),
    list: listHostedLibraryDocuments,
    open: async (docId) => { location.assign(`/?doc=${encodeURIComponent(docId)}`) },
    remove: (docId) => deleteHostedDocument(docId),
    create: async () => { location.assign('/?new=1') },
    setupVault: () => ensureHostedVaultKey(),
    vaultState: () => getHostedVaultState(),
    continueLocal: () => { location.assign('/') },
    signOut: () => { signOutHosted(); location.assign('/library') },
  })
}

/**
 * Read-only files are PLAYER files: they open straight into the show and
 * never expose the editor. Leaving the presentation lands on a minimal card.
 */
function playerMode(doc: BentoDoc) {
  document.title = `${doc.title} — ${appConfig().appName}`
  if (doc.fonts?.length) injectFonts(doc)
  document.getElementById('bento-splash')?.remove()
  const card = document.createElement('div')
  card.className = 'ed-player'
  card.innerHTML =
    `<div class="ed-playercard"><h1>${doc.title.replace(/</g, '&lt;')}</h1>` +
    `<p>${t('This is a presentation package — view and present only.')}</p>` +
    `<button class="ed-playgo">▶&nbsp; ${t('Present')}</button>` +
    `<button class="ed-playcopy">⤓&nbsp; ${t('Save a copy')}</button></div>`
  document.body.appendChild(card)
  const start = () => {
    card.style.display = 'none'
    startPresentation(doc, 0, () => {
      card.style.display = ''
    })
  }
  card.querySelector('.ed-playgo')!.addEventListener('click', start)
  card.querySelector('.ed-playcopy')!.addEventListener('click', () => {
    void serializeAuto(doc).then((html) => downloadFile(html, suggestedFileName(doc)))
  })
  ;(window as any).bento = { format: doc.format, doc, readonly: true }
  start()
}

function editorMode(doc: BentoDoc, hosted?: HostedBoot) {

document.title = `${doc.title} — ${appConfig().appName}`

// Embedded fonts: register @font-face rules from the asset table so text
// elements can use bundled families in the editor, presenter and thumbnails.
if (doc.fonts?.length) injectFonts(doc)

const store = new Store(doc)
const editor = new Editor(document.getElementById('app')!, store)

// Live collaboration (bento-sync): same-machine tabs sync automatically over
// BroadcastChannel; the online relay transport joins via the Share UI.
const session = new SyncSession(store)
editor.connectSync(session)

let hostedDocId: string | null = hosted?.docId ?? null
let hostedVersionId: string | null = hosted?.versionId ?? null
let hostedSessionId: string | null = null
let hostedSessionHeartbeat: number | null = null

function hostedSaveKey(value: BentoDoc): string {
  return `${docContentKey(value)}:${value.collab && onlineTransport() ? 'live' : 'offline'}`
}

let hostedContentKey: string | null = hosted ? hostedSaveKey(doc) : null

const hostedMetadata = () => ({
  title: store.doc.title,
  format: store.doc.format,
  keywords: store.doc.meta?.keywords,
})

// Hosted snapshots already have an account-level encrypted envelope. Keep the
// inner Bento document plain so opening a hosted deck needs only the vault key;
// older snapshots containing bento/enc remain readable in loadHostedDocument().
// A deck's auto-minted collab credentials do not mean the user went live. Do
// not make a hosted save join the relay unless this editor is actually live.
const hostedHtml = () => {
  const snapshot = JSON.parse(JSON.stringify(store.doc)) as BentoDoc
  // Preserve CRDT tombstones/registers even for an offline hosted save. The
  // relay may still hold an older snapshot; without this state, rejoining can
  // briefly resurrect deleted elements before local values win again.
  session.stampInto(snapshot, true)
  if (snapshot.collab && !onlineTransport()) snapshot.collab.on = false
  return serializeFile(snapshot)
}

const stopHostedSession = async () => {
  if (hostedSessionHeartbeat !== null) {
    window.clearInterval(hostedSessionHeartbeat)
    hostedSessionHeartbeat = null
  }
  if (hostedDocId && hostedSessionId) {
    await closeHostedSession(hostedDocId, hostedSessionId)
  }
  hostedSessionId = null
}

const startHostedSessionRecord = async (): Promise<import('./hosted').HostedSession | null> => {
  const relayRoom = store.doc.collab?.room
  if (!hostedDocId || !relayRoom || !onlineTransport()) return null
  const session = await registerHostedSession(hostedDocId, relayRoom, hostedSessionId ?? undefined)
  hostedSessionId = session.sessionId
  if (hostedSessionHeartbeat === null) {
    hostedSessionHeartbeat = window.setInterval(() => {
      void startHostedSessionRecord().catch((error: unknown) => console.warn('[bento-hosted] session heartbeat failed', error))
    }, 30_000)
  }
  return session
}

const createOrSaveHosted = async () => {
  const contentKey = hostedSaveKey(store.doc)
  if (hostedDocId && hostedContentKey === contentKey) {
    store.setDirty(false)
    return null
  }
  const html = await hostedHtml()
  if (!hostedDocId) {
    const created = await createHostedDocument(store.doc.docId, store.doc.format, hostedMetadata(), await html)
    hostedDocId = created.docId
    hostedVersionId = created.currentVersionId
    hostedContentKey = contentKey
    const url = new URL(location.href)
    url.searchParams.delete('new')
    url.searchParams.set('doc', hostedDocId)
    history.replaceState(history.state, '', url)
    store.setDirty(false)
    await startHostedSessionRecord()
    return created
  }
  const current = await getHostedDocument(hostedDocId)
  if (!current.currentVersionId) throw new Error('Hosted document has no current version')
  const version = await saveHostedVersion(hostedDocId, current.currentVersionId, store.doc.format, hostedMetadata(), await html)
  hostedVersionId = version.versionId
  hostedContentKey = contentKey
  store.setDirty(false)
  await startHostedSessionRecord()
  return version
}

const openHostedIntoEditor = async (docId: string) => {
  const opened = await openHostedDocument(docId)
  const parsed = new DOMParser().parseFromString(opened.html, 'text/html')
  const body = parsed.getElementById('bento-doc')?.textContent?.trim()
  if (!body) throw new Error('Hosted file has no document block')
  const envelope = parseEnvelope(body)
  let json = body
  if (envelope) {
    const password = window.prompt('Document password')
    if (!password) throw new Error('Document password is required')
    const decrypted = await decryptEnvelope(envelope, password)
    if (!decrypted) throw new Error('Wrong document password')
    setEncryptionPassword(password)
    json = decrypted
  }
  const next = parseDoc(json)
  if (!next) throw new Error('Hosted file contains an invalid document')
  store.replaceDoc(next)
  hostedDocId = opened.document.docId
  hostedVersionId = opened.document.currentVersionId
  hostedContentKey = hostedSaveKey(next)
  store.setDirty(false)
  return next
}

// Opening a link ending in #present starts the show immediately (player mode).
if (location.hash === '#present') {
  editor.present(true)
}

// Dismiss the boot splash (inline in index.html so it paints before this
// bundle parses). Hold it briefly so the assemble animation reads as a
// brand moment instead of a flicker; the pristine capture ran before this,
// so saved files keep the splash for their own next boot.
{
  const splash = document.getElementById('bento-splash')
  if (splash) {
    const wait = Math.max(0, 1250 - performance.now())
    setTimeout(() => {
      splash.classList.add('done')
      setTimeout(() => splash.remove(), 550)
    }, wait)
  }
}

// Small scripting surface for tooling and automation: read/replace the
// document model and serialize the full .bento.html file.
;(window as any).bento = {
  format: doc.format,
  get doc() {
    return store.doc
  },
  serialize: () => {
    session.stampInto(store.doc)
    return serializeFile(store.doc)
  },
  undo: () => store.undo(),
  redo: () => store.redo(),
  get selection() {
    return store.selection.slice()
  },
  /** animation engine, exposed for scripting/diagnostics */
  anim,
  /** i18n: t/locale/setLocale/choices — setLocale('x-pseudo') audits the sweep */
  i18n: i18nApi,
  /** live-collaboration session: actor id, connected peers, force a diff-flush */
  sync: {
    get actor() {
      return session.actor
    },
    peers: () => session.peers(),
    flush: () => session.flush(),
    transports: () => session.transportKinds,
    /** start an online session (mints doc.collab, connects the relay) */
    share: () => {
      void startSharing(session, store)
      return store.doc.collab
    },
    unshare: () => {
      void stopSharing(session, store)
      void stopHostedSession()
    },
    online: () => onlineTransport()?.status ?? 'off',
  },
  hosted: {
    get token() { return getHostedToken() },
    oidcConfig: () => getHostedOidcConfig(),
    oidcSignedIn: () => isHostedOidcSignedIn(),
    profile: () => getHostedProfile(),
    signIn: () => signInHosted(),
    signOut: () => signOutHosted(),
    setToken: (token: string | null) => setHostedToken(token),
    setPassword: (password: string | null) => setHostedPassword(password),
    ensureVault: () => ensureHostedVaultKey(),
    createOrSave: () => createOrSaveHosted(),
    startSession: () => startHostedSessionRecord(),
    stopSession: () => stopHostedSession(),
    openLibrary: () => {
      if (isHostedOidcSignedIn()) location.assign('/library')
      else void signInHosted()
    },
    list: () => listHostedDocuments(),
    open: (docId: string) => openHostedIntoEditor(docId),
    get current() { return { docId: hostedDocId, versionId: hostedVersionId } },
  },
  /** Explicit browser bridge for a trusted MCP agent. */
  agent: (() => {
    let socket: WebSocket | null = null
    let state: 'off' | 'connecting' | 'waiting' | 'connected' = 'off'
    let pairingCode: string | null = null
    const sendResponse = (requestId: string, ok: boolean, value?: unknown, error?: string) => {
      if (socket?.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'response', requestId, ok, ...(value === undefined ? {} : { value }), ...(error ? { error } : {}) }))
    }
    const handleRequest = (message: { requestId?: string; operation?: string; json?: string; params?: Record<string, unknown> }) => {
      if (typeof message.requestId !== 'string') return
      try {
        const params = message.params ?? {}
        if (message.operation === 'read_document') {
          sendResponse(message.requestId, true, store.doc)
          return
        }
        if (message.operation === 'summary') {
          sendResponse(message.requestId, true, {
            docId: store.doc.docId,
            title: store.doc.title,
            size: store.doc.size,
            slides: store.doc.slides.map((slide, index) => ({
              id: slide.id,
              index,
              name: slide.name ?? null,
              elementCount: slide.elements.length,
              elements: slide.elements.map((element) => ({
                id: element.id,
                type: element.type,
                text: element.type === 'text' ? element.html.replace(/<[^>]+>/g, '').slice(0, 200) : undefined,
              })),
            })),
          })
          return
        }
        if (message.operation === 'create_slide') {
          const afterSlideId = typeof params.afterSlideId === 'string' ? params.afterSlideId : undefined
          const name = typeof params.name === 'string' && params.name.trim() ? params.name.trim() : undefined
          const slide = emptySlide({ name })
          let index = store.doc.slides.length
          store.commit(() => {
            const after = afterSlideId ? store.doc.slides.findIndex((item) => item.id === afterSlideId) : -1
            index = after >= 0 ? after + 1 : store.doc.slides.length
            store.doc.slides.splice(index, 0, slide)
          }, 'slides')
          sendResponse(message.requestId, true, { slideId: slide.id, index })
          return
        }
        if (message.operation === 'add_text') {
          if (typeof params.html !== 'string') throw new Error('add_text requires html.')
          const slide = typeof params.slideId === 'string' ? store.doc.slides.find((item) => item.id === params.slideId) : store.slide
          if (!slide) throw new Error('The requested slide was not found.')
          const number = (key: string, fallback: number) => typeof params[key] === 'number' && Number.isFinite(params[key]) ? params[key] as number : fallback
          const element = defaultText({
            html: params.html,
            x: number('x', 340), y: number('y', 300), w: number('w', 600), h: number('h', 120),
            fontSize: number('fontSize', 32),
          })
          store.commit(() => { slide.elements.push(element) })
          sendResponse(message.requestId, true, { slideId: slide.id, elementId: element.id })
          return
        }
        if (message.operation === 'update_element') {
          if (typeof params.slideId !== 'string' || typeof params.elementId !== 'string' || !params.patch || typeof params.patch !== 'object') throw new Error('update_element requires slideId, elementId and patch.')
          const slide = store.doc.slides.find((item) => item.id === params.slideId)
          const element = slide?.elements.find((item) => item.id === params.elementId)
          if (!element) throw new Error('The requested element was not found.')
          const allowed = ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'html', 'fontSize', 'fontWeight', 'color', 'align', 'valign', 'lineHeight', 'fill', 'stroke', 'strokeWidth', 'radius']
          const patch = params.patch as Record<string, unknown>
          store.commit(() => {
            for (const key of allowed) if (key in patch) (element as unknown as Record<string, unknown>)[key] = patch[key]
          })
          sendResponse(message.requestId, true, { slideId: slide!.id, elementId: element.id })
          return
        }
        if (message.operation === 'delete_element') {
          if (typeof params.slideId !== 'string' || typeof params.elementId !== 'string') throw new Error('delete_element requires slideId and elementId.')
          const slide = store.doc.slides.find((item) => item.id === params.slideId)
          if (!slide || !slide.elements.some((item) => item.id === params.elementId)) throw new Error('The requested element was not found.')
          store.commit(() => { slide.elements = slide.elements.filter((item) => item.id !== params.elementId) })
          sendResponse(message.requestId, true, { slideId: slide.id, elementId: params.elementId })
          return
        }
        if (message.operation === 'set_notes') {
          if (typeof params.slideId !== 'string' || typeof params.notes !== 'string') throw new Error('set_notes requires slideId and notes.')
          const slide = store.doc.slides.find((item) => item.id === params.slideId)
          if (!slide) throw new Error('The requested slide was not found.')
          store.commit(() => { slide.notes = params.notes as string })
          sendResponse(message.requestId, true, { slideId: slide.id })
          return
        }
        if (message.operation === 'replace_document' && typeof message.json === 'string') {
          const nextDoc = parseDoc(message.json)
          if (!nextDoc || nextDoc.docId !== store.doc.docId) throw new Error('The replacement must be a valid document with the same docId.')
          store.replaceDoc(nextDoc)
          const titleInput = document.querySelector<HTMLInputElement>('.ed-title')
          if (titleInput) titleInput.value = nextDoc.title
          document.title = `${nextDoc.title} — ${appConfig().appName}`
          sendResponse(message.requestId, true, { ok: true, docId: nextDoc.docId })
          return
        }
        sendResponse(message.requestId, false, undefined, 'Unsupported browser bridge operation.')
      } catch (error) {
        sendResponse(message.requestId, false, undefined, error instanceof Error ? error.message : 'Browser bridge operation failed.')
      }
    }
    const connect = (url: string, token: string) => {
      socket?.close()
      const next = new WebSocket(url)
      socket = next
      state = 'connecting'
      next.addEventListener('open', () => {
        next.send(JSON.stringify({ type: 'register', docId: store.doc.docId, token }))
      })
      next.addEventListener('message', (event) => {
        let message: { type?: string; requestId?: string; operation?: string; json?: string; params?: Record<string, unknown> }
        try { message = JSON.parse(String(event.data)) } catch { return }
        if (message.type === 'registered' || message.type === 'paired') state = 'connected'
        if (message.type === 'waiting') state = 'waiting'
        if (message.type !== 'request') return
        handleRequest(message)
      })
      return { status: 'connecting', docId: store.doc.docId }
    }
    const connectPairing = async (adapterUrl: string) => {
      const base = adapterUrl.replace(/\/$/, '')
      const response = await fetch(`${base}/pairings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(hostedDocId && getHostedToken() ? { authorization: `Bearer ${getHostedToken()}` } : {}),
        },
        body: JSON.stringify({ docId: store.doc.docId }),
      })
      const pairing = await response.json() as { pairingId?: string; code?: string; expiresAt?: number; error?: string }
      if (!response.ok || !pairing.pairingId || !pairing.code) throw new Error(pairing.error || 'Agent pairing failed.')
      pairingCode = pairing.code
      const wsUrl = base.replace(/^http/, 'ws') + '/bridge'
      socket?.close()
      const next = new WebSocket(wsUrl)
      socket = next
      state = 'connecting'
      next.addEventListener('open', () => {
        state = 'waiting'
        next.send(JSON.stringify({ type: 'pair', pairingId: pairing.pairingId, docId: store.doc.docId }))
      })
      next.addEventListener('message', (event) => {
        let message: { type?: string; requestId?: string; operation?: string; json?: string; params?: Record<string, unknown> }
        try { message = JSON.parse(String(event.data)) } catch { return }
        if (message.type === 'paired') state = 'connected'
        if (message.type !== 'request') return
        handleRequest(message)
      })
      return { code: pairing.code, expiresAt: pairing.expiresAt, docId: store.doc.docId }
    }
    return {
      connect,
      connectPairing,
      disconnect: () => { socket?.close(); socket = null; state = 'off'; pairingCode = null },
      status: () => state,
      pairingCode: () => pairingCode,
    }
  })(),
  /**
   * AI/tooling round-trip: replace the whole document from a JSON string
   * (the contents of #bento-doc). Validates via parseDoc; returns false and
   * changes nothing on invalid input. Undoable in the editor.
   */
  loadDoc(json: string): boolean {
    const next = parseDoc(json)
    if (!next) return false
    store.replaceDoc(next)
    return true
  },
  /**
   * Self-update surface (all user/tooling-initiated, never automatic):
   * check() fetches + signature-verifies the release manifest; build()
   * returns the updated file's html (this doc inside the new shell);
   * apply() downloads it. check(url) accepts an override for testing.
   */
  updates: {
    version: APP_VERSION,
    check: (url?: string) => checkForUpdates(url),
    build: (release: any) => {
      session.stampInto(store.doc)
      return buildUpdatedFile(release, store.doc)
    },
    apply: (release: any) => {
      session.stampInto(store.doc)
      return applyUpdate(release, store.doc)
    },
  },
  /**
   * Flat list of every review comment thread — the entry point for tooling
   * and AI agents processing the deck ("fix everything people flagged"):
   * each item carries the slide, a typed anchor (element / point / slide),
   * author, text, replies and resolved state.
   */
  comments() {
    return store.doc.slides.flatMap((s, slideIndex) =>
      (s.comments ?? []).map((c) => ({
        slideId: s.id,
        slideIndex,
        id: c.id,
        anchor: c.elementId
          ? { type: 'element' as const, elementId: c.elementId }
          : typeof c.x === 'number'
            ? { type: 'point' as const, x: c.x, y: c.y }
            : { type: 'slide' as const },
        author: c.author,
        at: c.at,
        text: c.text,
        replies: c.replies ?? [],
        resolved: !!c.resolved,
      })),
    )
  },
}

} // editorMode
