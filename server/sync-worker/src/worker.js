// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// bento-sync relay — the first (and only) Bento server code. One Durable
// Object per docId room. The relay is BLIND by design:
//
//   - every frame body is AES-GCM ciphertext produced by the clients; the
//     room key lives in the document file and never reaches this server
//   - auth is possession-proof: ?tok= is a hash of the room key. The first
//     client to open a room sets its token; everyone else must match it
//   - persisted state is an append-only list of encrypted op frames plus
//     the latest client-produced encrypted snapshot (the server cannot make
//     one — it can't read anything)
//   - rooms expire after ~30 idle days (the FILE is the durable artifact;
//     expiry costs convenience, never data)
//
// Envelope (JSON text frames, ≤ MAX_FRAME):
//   client → server:  { i, d }            ephemeral (presence, hello, need)
//                     { p:1, i, d }       persist an op batch
//                     { snap:1, q, i, d } encrypted snapshot covering seq ≤ q
//   server → clients: same frames fanned out, ops stamped with { q: seq };
//                     on join: snapshot (if any) + ops since ?since= then
//                     { ctl:'ready', q: latest }

const IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000
// The binding constraint is DURABLE OBJECT STORAGE, not the WebSocket message
// size. The platform raised WS messages to 32 MiB (2025-10-31), but a single
// stored value still caps around 2 MB — measured against workerd: 2 MB stores,
// 2.5 MB throws inside storage.put(). So a frame larger than the storage limit
// is worse than useless: it passes every check, then disappears.
//
// 1.9 MB keeps "accepted" and "storable" the same thing, and still nearly
// doubles the old 1 MB. An asset costs ~1.78x its binary size on the wire
// (base64 twice — data URI, then the ciphertext), so this carries roughly
// 1.05 MB of binary — photos, not video.
//
// MEDIA_EMBED_BUDGET is 8 MB, so media collaboration is NOT fixed by this
// constant and cannot be: it needs chunked ops or content-addressed blobs
// (docs/relay-design.md, "Wire efficiency").
const MAX_FRAME = 1_900_000
const RATE_BURST = 200 // frames per window per socket
const RATE_WINDOW_MS = 10_000
// Bytes a single socket may persist per window. Frame COUNT alone is not a
// budget when a single frame can approach 2 MB.
const RATE_BYTES = 8 * 1024 * 1024
// Hard ceiling on persisted bytes per room (ops + snapshot). Bounds the cost
// of any one room regardless of frame size — the actual protection against an
// unbounded bill, since room creation is unauthenticated by design.
const ROOM_BYTE_CAP = 96 * 1024 * 1024
const OP_KEY = (seq) => `op:${String(seq).padStart(10, '0')}`

/** Tell the sender why a frame was refused. Clients MUST stop re-queueing an
 *  op that comes back 'too-large' / 'room-full' — silently dropping is what
 *  turned an oversize asset into a permanent resend loop. */
function refuse(ws, code, detail) {
  try { ws.send(JSON.stringify({ ctl: 'refused', code, ...detail })) } catch { /* gone */ }
}

// --- signed writes (see docs/collab-design.md) ------------------------------
// A room whose name starts with 'w' is SIGNED: the name commits to an ECDSA
// P-256 writer pubkey ('w' + base64url(SHA-256(pubRaw))). Clients present the
// raw pubkey as ?w=; the relay pins it (commitment-checked, so a viewer can't
// substitute their own) and thereafter requires a valid signature `g` over
// `${i}.${d}` on every persisted frame (op batch / snapshot). Viewers hold the
// pubkey but not the private half — their writes are dropped, so read-only is
// ENFORCED here while the relay stays blind to content. 'r' rooms are legacy
// and stay permissive.
const b64uDec = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}
const b64uEnc = (bytes) => {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const EC_VERIFY = { name: 'ECDSA', namedCurve: 'P-256' }
const SIG_ALG = { name: 'ECDSA', hash: 'SHA-256' }
async function sha256b64u(bytes) {
  return b64uEnc(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const m = url.pathname.match(/^\/d\/([A-Za-z0-9._-]{1,80})$/)
    if (!m) {
      return new Response('bento-sync relay — see https://bento.page', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    }
    const id = env.ROOM.idFromName(m[1])
    // Surface DO failures as a readable body instead of an opaque CF 1101
    // ("Worker threw exception") — the room path needs the SQLite storage
    // backend, so a mis-provisioned migration shows up right here.
    try {
      return await env.ROOM.get(id).fetch(req)
    } catch (e) {
      return new Response('room error: ' + (e && e.stack ? e.stack : String(e)), {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      })
    }
  },
}

export class Room {
  constructor(state) {
    this.state = state
    this.verifyKey = null // imported writer pubkey, cached for this wake
    // Keepalive: auto-reply "pong" to a client "ping" WITHOUT waking the DO, so
    // idle connections aren't reaped by edge/proxy idle timeouts — the usual
    // cause of "connects and drops" on hibernated WebSockets. Costs no active
    // duration; retained across hibernation. Set here so every wake re-applies it.
    try {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    } catch { /* older runtime without auto-response — clients still reconnect */ }
  }

  /** Valid writer signature over `${i}.${d}` for a signed room? */
  /** Import-and-cache a raw P-256 pubkey (b64url) for this wake. */
  async pubKey(pubB64) {
    this.keyCache ??= new Map()
    let k = this.keyCache.get(pubB64)
    if (!k) {
      k = await crypto.subtle.importKey('raw', b64uDec(pubB64), EC_VERIFY, false, ['verify'])
      this.keyCache.set(pubB64, k)
    }
    return k
  }

  async verifyWith(pubB64, sigB64, text) {
    try {
      return await crypto.subtle.verify(
        SIG_ALG, await this.pubKey(pubB64), b64uDec(sigB64), new TextEncoder().encode(text),
      )
    } catch { return false }
  }

  /** Frame signature against THIS SOCKET's certified key (v1.0.3: the verify
   *  key is per-socket — owner, legacy shared writer, or a chain-certified
   *  member all pin their own key at connect). */
  async verifySig(f, ws) {
    if (typeof f.g !== 'string') return false
    const meta = ws.deserializeAttachment() || {}
    if (!meta.w) return false
    return this.verifyWith(meta.w, f.g, `${f.i}.${f.d}`)
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const url = new URL(req.url)
    const tok = url.searchParams.get('tok') || ''
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(tok)) return new Response('bad token', { status: 400 })
    const saved = await this.state.storage.get('tok')
    if (saved === undefined) await this.state.storage.put('tok', tok)
    else if (saved !== tok) return new Response('forbidden', { status: 403 })

    // Signed rooms: the room name commits to a pubkey (v1.0.2: the shared
    // writer key; v1.0.3: the OWNER key). A writer socket presents ?w= (the key
    // it will sign frames with) and proves it either DIRECTLY (hash matches the
    // commitment — owner / legacy shared writer) or via a CHAIN (member: the
    // owner-signed invite + the invite-signed delegation of the member key).
    // The verified key is pinned PER SOCKET; no ?w= at all = read-only socket.
    const name = url.pathname.match(/^\/d\/([A-Za-z0-9._-]{1,80})$/)?.[1] || ''
    if ((await this.state.storage.get('name')) === undefined) await this.state.storage.put('name', name)
    const signed = name[0] === 'w'
    let sockW = null
    if (signed) {
      const w = url.searchParams.get('w') || ''
      if (w) {
        if (!/^[A-Za-z0-9_-]{80,200}$/.test(w)) return new Response('bad writer key', { status: 400 })
        const rev = (await this.state.storage.get('rev')) || []
        let ok = 'w' + (await sha256b64u(b64uDec(w))) === name
        if (!ok) {
          // chain: o (owner pub) must match the commitment; ivs = owner's sig
          // over the invite; dg = invite's sig over this member key. Expired or
          // revoked links (member key OR invite key) are refused.
          const o = url.searchParams.get('o') || ''
          const ivp = url.searchParams.get('ivp') || ''
          const ivr = url.searchParams.get('ivr') || ''
          const ive = parseInt(url.searchParams.get('ive') || '0', 10) || 0
          const ivs = url.searchParams.get('ivs') || ''
          const dg = url.searchParams.get('dg') || ''
          ok = !!(o && ivp && ivs && dg)
            && ivr === 'writer'
            && (!ive || Date.now() < ive)
            && !rev.includes(ivp)
            && 'w' + (await sha256b64u(b64uDec(o))) === name
            && (await this.verifyWith(o, ivs, `inv.${ivp}.${ivr}.${ive}`))
            && (await this.verifyWith(ivp, dg, `dlg.${w}`))
        }
        if (!ok || rev.includes(w)) return new Response('forbidden', { status: 403 })
        sockW = w
      }
    }

    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0)
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    // WebSocket Hibernation: the runtime owns the socket, so the Durable Object
    // can be evicted from memory while connections stay open — it accrues no
    // active duration while idle. This is what keeps a live relay within the DO
    // free-tier duration limit (plain server.accept() keeps the invocation
    // running for the whole connection and throws "Exceeded allowed duration").
    // Per-socket rate-limit state rides on the socket's serialized attachment
    // (in-memory Maps don't survive hibernation).
    this.state.acceptWebSocket(server)
    server.serializeAttachment({ count: 0, windowStart: Date.now(), signed, w: sockW })

    await this.replay(server, since)
    await this.state.storage.setAlarm(Date.now() + IDLE_TTL_MS)
    return new Response(null, { status: 101, webSocket: client })
  }

  // --- hibernation handlers (fire on wake; replace addEventListener) ---------
  async webSocketMessage(ws, data) {
    await this.onMessage(ws, data).catch(() => {})
  }
  webSocketClose(ws) {
    try { ws.close() } catch { /* already closed */ }
  }
  webSocketError() { /* the runtime drops the socket; nothing to clean up */ }

  async replay(ws, since) {
    const seq = (await this.state.storage.get('seq')) || 0
    const snap = await this.state.storage.get('snap')
    let from = since
    try {
      if (snap && (since === 0 || snap.q >= since)) {
        ws.send(JSON.stringify({ snap: 1, q: snap.q, i: snap.i, d: snap.d }))
        from = snap.q
      }
      if (seq > from) {
        const ops = await this.state.storage.list({
          start: OP_KEY(from + 1),
          end: OP_KEY(seq + 1),
        })
        for (const [key, f] of ops) {
          ws.send(JSON.stringify({ q: parseInt(key.slice(3), 10), i: f.i, d: f.d }))
        }
      }
      ws.send(JSON.stringify({ ctl: 'ready', q: seq }))
    } catch {
      /* socket died mid-replay */
    }
  }

  async onMessage(ws, data) {
    if (typeof data !== 'string') return
    // Oversize is REFUSED, not dropped: a silent drop leaves the sender with no
    // ack, the peer permanently behind, and the need/vv catch-up re-sending the
    // same doomed frame forever.
    if (data.length > MAX_FRAME) {
      return refuse(ws, 'too-large', { max: MAX_FRAME, got: data.length })
    }
    // keepalive fallback: if the runtime auto-response isn't active this reaches
    // us — reply "pong" so a pinging client never mistakes a live socket for dead.
    if (data === 'ping') { try { ws.send('pong') } catch { /* gone */ } return }
    // rate-limit window lives on the socket attachment (survives hibernation)
    const meta = ws.deserializeAttachment() || { count: 0, windowStart: Date.now(), bytes: 0 }
    const now = Date.now()
    if (now - meta.windowStart > RATE_WINDOW_MS) {
      meta.windowStart = now
      meta.count = 0
      meta.bytes = 0
    }
    meta.count++
    meta.bytes = (meta.bytes || 0) + data.length
    ws.serializeAttachment(meta)
    if (meta.count > RATE_BURST) return
    if (meta.bytes > RATE_BYTES) return refuse(ws, 'rate-limited', { retryInMs: RATE_WINDOW_MS })
    let f
    try {
      f = JSON.parse(data)
    } catch {
      return
    }
    // owner-signed revocation: cut off ONE member key (or a whole invite
    // lineage) without re-keying the room. Plaintext control frame — it names
    // only pubkeys, never content. Live sockets on the revoked key are closed.
    if (f.ctl === 'revoke' && typeof f.p === 'string' && typeof f.o === 'string' && typeof f.g === 'string') {
      const name = (await this.state.storage.get('name')) || ''
      if ('w' + (await sha256b64u(b64uDec(f.o))) !== name) return
      if (!(await this.verifyWith(f.o, f.g, `rev.${f.p}`))) return
      const rev = (await this.state.storage.get('rev')) || []
      if (!rev.includes(f.p)) await this.state.storage.put('rev', [...rev, f.p])
      const note = JSON.stringify({ ctl: 'revoked', p: f.p })
      for (const peer of this.state.getWebSockets()) {
        const m = peer.deserializeAttachment() || {}
        try { peer.send(note) } catch { /* gone */ }
        if (m.w === f.p) { try { peer.close(1008, 'revoked') } catch { /* gone */ } }
      }
      return
    }
    if (typeof f.i !== 'string' || typeof f.d !== 'string') return
    // defense in depth: a revoked key's socket may outlive the close (or the
    // revocation may land on another wake) — its writes must still die here.
    if (meta.w && (f.p === 1 || f.snap === 1)) {
      const rev = (await this.state.storage.get('rev')) || []
      if (rev.includes(meta.w)) return
    }

    // Signed rooms: a persisted frame (op batch / snapshot) must carry a valid
    // writer signature, else DROP it — this is what enforces read-only. A
    // reader (no private key) can still send ephemeral frames (presence).
    if (meta.signed && (f.p === 1 || f.snap === 1)) {
      if (!(await this.verifySig(f, ws))) return
    }

    const out = { i: f.i, d: f.d }
    const weight = (f.i?.length || 0) + (f.d?.length || 0)
    if (f.p === 1) {
      // Per-room storage ceiling. Room creation is unauthenticated by design
      // (the token is trust-on-first-use), so this — not the frame size — is
      // what bounds what one room can cost. Refuse loudly: a client that keeps
      // retrying into a full room is the resend loop all over again.
      const used = (await this.state.storage.get('bytes')) || 0
      if (used + weight > ROOM_BYTE_CAP) {
        return refuse(ws, 'room-full', { cap: ROOM_BYTE_CAP, used })
      }
      const seq = ((await this.state.storage.get('seq')) || 0) + 1
      // Storage can still refuse (platform value limits move); surface it
      // instead of letting webSocketMessage's catch swallow it into a frame
      // the sender believes was accepted.
      try {
        await this.state.storage.put(OP_KEY(seq), { i: f.i, d: f.d })
      } catch (e) {
        return refuse(ws, 'storage-failed', { bytes: weight, detail: String(e && e.message || e).slice(0, 120) })
      }
      await this.state.storage.put('seq', seq)
      await this.state.storage.put('bytes', used + weight)
      out.q = seq
      // the sender needs its ack too (snapshot cadence keys off q)
      try {
        ws.send(JSON.stringify({ ctl: 'ack', q: seq }))
      } catch {
        /* gone */
      }
    } else if (f.snap === 1 && typeof f.q === 'number') {
      // client-produced encrypted snapshot: keep the newest, prune covered ops
      const cur = await this.state.storage.get('snap')
      if (!cur || f.q > cur.q) {
        // A snapshot supersedes every op it covers, so it RELIEVES pressure —
        // admit it even in a full room (bounded: one snapshot ≤ MAX_FRAME),
        // otherwise a room that fills up can never prune its way out.
        try {
          await this.state.storage.put('snap', { q: f.q, i: f.i, d: f.d })
        } catch (e) {
          return refuse(ws, 'storage-failed', { bytes: weight, detail: String(e && e.message || e).slice(0, 120) })
        }
        const dead = await this.state.storage.list({ start: OP_KEY(1), end: OP_KEY(f.q + 1) })
        // Give the pruned bytes back, or the cap becomes a one-way ratchet and
        // a long-lived healthy room eventually wedges itself shut.
        let freed = 0
        for (const [, v] of dead) freed += (v?.i?.length || 0) + (v?.d?.length || 0)
        await this.state.storage.delete([...dead.keys()])
        const used = (await this.state.storage.get('bytes')) || 0
        await this.state.storage.put('bytes', Math.max(0, used - freed))
      }
      return // snapshots are storage-only, never fanned out
    }

    const text = JSON.stringify(out)
    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue
      try {
        peer.send(text)
      } catch { /* runtime reaps dead sockets */ }
    }
    await this.state.storage.setAlarm(Date.now() + IDLE_TTL_MS)
  }

  async alarm() {
    // ~30 days idle: the room evaporates. Files reopen fine — the document
    // itself is the durable artifact; a fresh room re-forms on next join.
    await this.state.storage.deleteAll()
  }
}
