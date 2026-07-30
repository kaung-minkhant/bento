# bento implementation roadmap

Updated 2026-07-30.

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

Complete. Production acceptance on 2026-07-28 verified slide rendering, deck
thumbnail rendering, visual validation, targeted cleanup, and a full creative
redesign through an explicitly paired document. Inspection stayed read-only;
render and validation revisions remained stable.

### Phase 7: rich creation vocabulary

Complete. Local acceptance on 2026-07-28 verified revision-guarded dry runs,
atomic application and undo/redo, stale-revision rejection after concurrent
manual slide deletion, and all-or-nothing rejection of invalid batches. Rich
creation covered text, shapes, images, SVG, charts, tables, embedded assets,
grouping, alignment, distribution, custom layouts, theme controls, targeted
slide reads, rendering, and visual validation. Unsafe SVG and deletion of an
in-use asset were rejected without changing the document. Production
acceptance on 2026-07-29 created and visually validated an eight-slide academic
deck through targeted operations, then verified a revision-guarded atomic batch
containing an embedded SVG asset, chart, table, and audio element. Media played
in presentation mode and stopped on slide exit; agent undo removed the complete
batch and redo restored it. The temporary acceptance slide and its assets were
then removed atomically.

### Phase 8: composition system

Complete. Optional named design tokens and the read-only MCP visual-language
inspector feed a shared recipe engine. Ten recipes are available in the
editor's New Slide picker and through revision-guarded MCP creation. Existing
element properties remain the rendered source of truth so old decks do not
change appearance. Production acceptance on 2026-07-29 verified authoring
guide discovery, design-system inspection, presenter builds and morph metadata,
recipe discovery and creation, semantic recipe roles, rendering, validation,
and the structured narrative-quality report. The temporary acceptance slide
was removed atomically after verification.

- Expose deck themes, palettes, and named typography roles.
- Ten reusable composition recipes now cover thesis, comparison, academic
  results, section dividers, agendas, quotes, processes, chart-led findings,
  image narratives, and closing decisions without forcing every deck into one
  visual style.
- Let agents inspect and reuse the current deck's visual language.
- The read-only deck-quality audit now checks hierarchy, rhythm, density,
  consistency, semantic-role coherence, composition variety, and narrative
  flow. Its structured narrative map exposes title/role coverage, slide titles,
  density, and purpose signals while keeping all findings advisory.
- Presenter-controlled build steps are implemented: a click, Space, or forward arrow
  reveals the next element group before leaving the slide; elements assigned
  to the same step appear together, and backward navigation reverses builds
  before moving to the previous slide. Integrate builds with presenter view,
  reduced motion, media, links, transitions, undo/redo, and targeted MCP
  operations. Build progress remains runtime-only; configured entrance effects
  play on reveal, reduced motion preserves sequencing without tweening, and
  morph only considers elements visible at both endpoints.
- The MCP-native authoring guide, exposed as nine topic resources
  plus `get_authoring_guide`, with build-step syntax when presenter-controlled
  now documents build-step syntax and behavior. Drift tests cover the current
  operation vocabulary, recipes, and build guidance.

### Phase 9: transactional agent workflow

Implementation complete. The proposal contract is defined in
`docs/agent-proposals.md`: proposals are page-lifetime editor workflow state,
preflight at a guarded base revision, become stale after any intervening edit,
and can only be approved or rejected by a person in the editor. Reviewers can
request changes without mutating the deck, and agents can answer with an
explicitly linked replacement.

Local acceptance on 2026-07-30 verified exact operation summaries, bounded
before/after evidence, enlarged previews, approval, rejection, stale-state
handling, feedback-linked replacement proposals, compact proposal history,
post-approval rendering and validation, separation of new and pre-existing
findings, and human-requested corrective follow-ups. Cursor-based MCP event
waiting resumed the agent from feedback, approval, and verification without a
chat handoff. Opt-in browser notifications were deduplicated per proposal;
clicking one focused bento, opened the agent panel, and located the matching
approval. The final approved test introduced no new validation issues.

- Support the full inspect, plan, propose, review, apply, render, critique,
  refine, validate, and approve loop in the editor.
- Add explicit agent proposals and human approval checkpoints for broad or
  destructive changes while preserving narrow direct-edit tools.
- Apply approved operation batches atomically as one normal undo checkpoint.
- Expose submission and status through MCP without exposing an agent-side
  approval capability.

Production acceptance remains the release gate before Phase 9 is merged to
`main`: repeat notification, revision, approval, verification, and agent
undo/redo against the deployed MCP adapter.
