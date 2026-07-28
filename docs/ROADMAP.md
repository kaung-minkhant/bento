# bento implementation roadmap

Updated 2026-07-28.

## Phase 1: deployment foundation

Complete. The self-hosted deployment chain is working end to end:

- GitHub source repository
- GitLab container images for the frontend and document service
- Flux image detection and automation
- Kubernetes deployments
- Postgres and SeaweedFS connectivity
- Public frontend and backend health checks

## Phase 2: document-service vertical slice

Complete. The encrypted hosted-document path works end to end:

```text
create document
  -> upload encrypted initial version
  -> list and open document
  -> download and open it in bento/slides
  -> save a new durable version
```

Scope:

- Implement the document API endpoints currently returning `501`.
- Store encrypted `.bento.html` snapshots as immutable SeaweedFS objects.
- Store encrypted metadata, ownership, and version records in Postgres.
- Add recovery checkpoints separately from durable versions.
- Connect the frontend to create, list, open, and save hosted documents.
- Keep document content search client-side after a document is opened.
- Preserve `docId`, standalone-file operation, client-side encryption, and
  backward-compatible document format rules.

Deferred: durable version retention and expiration. Immutable version objects
and their Postgres records remain until an explicit retention policy is
designed and implemented; current work must not silently delete or expire
durable versions.

### User workflow boundary

Logged-in users get the hosted library, user-scoped documents, durable
SeaweedFS versions, and membership-controlled collaboration. Non-logged-in
users remain fully supported in local-first mode: they can open or create a
standalone `.bento.html`, edit it offline, save/download a copy, and use the
existing file-based live collaboration flow when a document carries an
invitation. They cannot browse or save to the hosted library, or access a
user-scoped hosted document, until they sign in. Hosted collaboration invites
may be opened by an anonymous participant only if a future capability-token
flow explicitly grants that access; this is not implicit from the document
URL.

The first phase-2 milestone is a single document owned by one authenticated
subject. Sharing, multi-user access, and agent access come later.

## Phase 3: live sessions

Complete.

- Connect hosted documents to the existing CRDT relay.
- Start and resume scoped sessions.
- Support presence and session lifecycle metadata.
- Preserve the blind-relay and client-owned-key model.

## Phase 4: MCP agent adapter

Complete. The generic adapter and explicit browser bridge are deployed and
working through both production and local MCP endpoints.

- Expose document and session operations through a generic MCP server. The
  first adapter slice now lives in `server/mcp-adapter` and supports both
  Streamable HTTP and stdio transports.
- Keep the adapter agent-agnostic rather than integrating individual agents.
- Keep the adapter metadata/session-only until browser-mediated document
  capabilities are implemented: it never decrypts stored snapshots or receives
  vault or relay keys. The explicit browser bridge now provides read and
  replace operations for one open document, with a short-lived pairing flow
  initiated from the editor's Agent control.
- Route content actions through normal document-model mutations so
  undo, autosave, collaboration, validation, and export continue to work.
- Scope every agent capability to an explicit document and role.

## Phase 5: library and agent workflow

Complete. The hosted library and open-document agent workflow are deployed.
Agent activity is visible in the editor, targeted document tools mutate through
the normal store path, and guarded multi-level agent undo/redo supports review
and iteration without crossing intervening user edits.

- Add the document library/explorer UI.
- Let a user ask an agent to build a deck in an open document.
- Show progress and changes live in the editor.
- Support review, iteration, and approval without JSON copy/paste.

## Completion boundary

Phases 1–5 are complete. Production acceptance on 2026-07-28 verified MCP
pairing, targeted text mutations, repeated undo and redo, redo invalidation
after a manual edit, and activity-history clearing without changing document
content. The file remains authoritative, hosted snapshots remain encrypted,
and agent content access still requires an explicit browser pairing.

Fine-grained collaboration access-control phases are tracked separately in
`docs/collab-design.md`.

## Continuing roadmap: agent-authored decks

The next milestone is an agent that can compose a complete slide, inspect its
rendered result, identify visual problems, and refine it through targeted,
undoable mutations rather than replacing the whole document JSON.

### Phase 6: visual feedback loop

- Render one slide to a preview image through the explicit browser bridge.
- Render compact deck thumbnails for narrative and consistency review.
- Validate overflow, clipping, off-canvas geometry, unintended overlap, and
  low-contrast text.
- Keep rendered content scoped to the explicitly paired document.

### Phase 7: rich creation vocabulary

- Add targeted tools for shapes, images, lines, charts, and tables.
- Add slide background, transition, and layout controls.
- Expand element updates to the presentation properties already supported by
  the editor, including typography, fills, borders, shadows, and effects.
- Support duplication, alignment, distribution, grouping, and z-order without
  requiring full-document replacement.
- Add safe asset ingestion and reuse for embedded and generated images.

### Phase 8: composition system

- Expose deck themes, palettes, and named typography roles.
- Provide reusable layout recipes for common presentation structures without
  forcing every deck into one visual style.
- Let agents inspect and reuse the current deck's visual language.
- Add design-quality checks across slides for hierarchy, rhythm, consistency,
  and narrative flow.

### Phase 9: transactional agent workflow

- Apply several targeted operations atomically as one activity entry and one
  undo checkpoint.
- Require revision preconditions so stale plans fail safely.
- Validate a batch before mutation and leave the document unchanged on error.
- Support the full inspect, plan, apply, render, critique, refine, validate,
  and approve loop in the editor.

The implementation order starts with slide rendering and validation. Richer
creation tools follow only once agents can see and evaluate what they produce.
