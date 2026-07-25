# bento document and session protocol

Status: design draft. This document formalizes the boundary for future hosted
documents and agent clients. It does not add a document library or MCP server.

## Purpose

bento has two related but separate things:

- A **document** is a standalone bento file. Its JSON document model, embedded
  in `#bento-doc`, is the durable source of truth.
- A **session** is a temporary set of clients collaborating on one document.
  The session distributes CRDT operations and presence; it is not the durable
  document itself.

Any future web service or agent must use this boundary. A hosted service may
store document files and session history, but the editor must remain able to
open an exported document without that service.

## Document identity

`docId` is the stable identity of a document. It must survive saves, exports,
updates, and normal copies of the same document. A deliberate "new deck" or
template-instantiation flow creates a new identity.

The document contract remains the existing `BentoDoc` JSON model:

- `format` identifies the app (`bento/slides`).
- `version` identifies the document schema.
- `docId` identifies the document.
- `slides` and the other model fields contain the document state.
- `collab` is optional session/access material and is not required to open the
  document offline.

The standalone HTML file is a compact snapshot of document state. It is not an
operation log and does not require a network connection.

## Session identity

A session is identified by the collaboration configuration associated with a
document, currently including its room URL and key. The room is a transport
endpoint, not a second document identity. A future hosted document service may
create or resume sessions, but it must not replace `docId` with a server ID.

Session state has three classes:

1. **Durable document state:** the materialized `BentoDoc` snapshot.
2. **Convergence state:** CRDT registers, version vectors, tombstones, and
   client-produced snapshots used to merge replicas.
3. **Ephemeral state:** presence, cursors, selections, current slide, and
   connection status.

Only the first class is required for a standalone file. The second may be
stored in the optional collaboration payload or on the relay. The third must
not be treated as document content.

## Client lifecycle

A document client follows this lifecycle:

1. **Open:** parse the standalone document and preserve its `docId`.
2. **Adopt:** create a fresh actor identity for this client instance.
3. **Join:** authenticate to the configured room when sharing is enabled and
   exchange the current CRDT state or missing operations.
4. **Edit:** mutate the normal document model. The existing differ converts
   local mutations into CRDT operations.
5. **Apply:** receive operations, apply them to the document model, and let the
   existing editor listeners refresh the UI.
6. **Save:** serialize a current document snapshot. When collaboration is
   active, stamp the convergence state into the optional collaboration data.
7. **Leave:** stop transports and discard ephemeral presence. The saved file
   remains usable.

An agent is a client in this lifecycle. It must not edit the HTML shell or
write an unrelated replacement file behind the editor's back.

## Mutation boundary

The canonical mutation path is:

```text
client intent
  -> document-model mutation
  -> store commit/touch
  -> CRDT diff
  -> signed/encrypted session frame
  -> remote CRDT apply
  -> document-model notification
  -> editor refresh
```

Future high-level agent actions such as `createSlide`, `addText`, or
`addSpeakerNotes` must eventually enter at the document-model mutation point.
They may be transported by MCP later, but MCP is an adapter and is not the
source of truth.

This preserves normal undo, autosave, collaboration, validation, and export
behavior for agent-authored changes.

## Roles and capabilities

The current collaboration roles remain the starting point:

- `owner`: may manage access and write.
- `editor`: may write document state.
- `reader`: may receive state and presence but cannot publish writes.

An agent connection must be scoped to an explicit document and role. A future
agent authorization must not grant access to every document belonging to a
user. The browser should be able to revoke the agent by removing its session
capability or rotating the document's collaboration keys.

The session service may authenticate a client and route frames, but the blind
relay must not need document plaintext. A deployment that gives a server-side
agent plaintext access is a separate, explicitly trusted mode.

## Compatibility rules

- Keep the existing CRDT frame version (`pv`) and sync-state version checks.
- Unknown frame types must be ignored or rejected without corrupting the
  document.
- Unknown document fields remain additive and must survive round-trips.
- Never regenerate `docId` during ordinary editing or saving.
- A client that cannot join a session must still open and edit the standalone
  file locally.

## Boundary for the next phase

This protocol draft is complete when a future service can implement these
operations without changing the editor's document semantics:

- create or open a document snapshot;
- join a live session for that document;
- exchange CRDT operations and convergence snapshots;
- publish presence;
- save or export a standalone document;
- grant and revoke a scoped client capability.

Document listing, metadata search, hosted storage, MCP tools, and the library
UI are deliberately outside this phase.
