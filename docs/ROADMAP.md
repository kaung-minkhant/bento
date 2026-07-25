# bento implementation roadmap

Updated 2026-07-26.

## Phase 1: deployment foundation

Complete. The self-hosted deployment chain is working end to end:

- GitHub source repository
- GitLab container images for the frontend and document service
- Flux image detection and automation
- Kubernetes deployments
- Postgres and SeaweedFS connectivity
- Public frontend and backend health checks

## Phase 2: document-service vertical slice

This is the current phase. Build one complete hosted-document path before
adding agent features:

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

The first phase-2 milestone is a single document owned by one authenticated
subject. Sharing, multi-user access, and agent access come later.

## Phase 3: live sessions

- Connect hosted documents to the existing CRDT relay.
- Start and resume scoped sessions.
- Support presence and session lifecycle metadata.
- Preserve the blind-relay and client-owned-key model.

## Phase 4: MCP agent adapter

- Expose document and session operations through a generic MCP server.
- Keep the adapter agent-agnostic rather than integrating individual agents.
- Route agent actions through normal document-model mutations so undo,
  autosave, collaboration, validation, and export continue to work.
- Scope every agent capability to an explicit document and role.

## Phase 5: library and agent workflow

- Add the document library/explorer UI.
- Let a user ask an agent to build a deck in an open document.
- Show progress and changes live in the editor.
- Support review, iteration, and approval without JSON copy/paste.

## Current boundary

Phase 2 should not expand into MCP, full collaboration, server-side content
search, or a broad library UI. Finish the encrypted create/open/save path and
validate it in the deployed environment first.
