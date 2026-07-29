# Agent proposals

Phase 9 adds a human approval boundary for broad or destructive agent changes.
This document defines the first implementation contract.

## Lifecycle

An agent submits a title, optional rationale, the current document revision,
and a normal `apply_operations` batch. The editor fully prepares and preflights
that batch against a cloned document before accepting the proposal.

Proposals have six observable states:

- `pending` — valid at its base revision and waiting for a person.
- `changes_requested` — a person supplied revision feedback without changing the document.
- `superseded` — an agent submitted a valid replacement linked to that feedback.
- `applied` — approved by a person and committed atomically.
- `rejected` — declined without changing the document.
- `stale` — the document revision changed before approval.

Approval applies the prepared batch as one normal store commit and therefore
one undo checkpoint. A rejected, stale, or applied proposal cannot be reused.
Agents can submit and inspect proposals, but cannot approve them through MCP.

A person may request changes from a pending proposal in the editor. The feedback
is page-lifetime proposal metadata and is visible through
`list_agent_proposals`. An agent responds by calling `propose_operations` with
`replacesProposalId`; successful preflight links the new proposal to the old one
and marks the old proposal superseded. The deck must remain at the same base
revision throughout this exchange.

## Storage boundary

Proposal state belongs to the open editor page, not the portable
`bento/slides` document model. It is deliberately absent from `#bento-doc`,
saved files, collaboration state, exports, and hosted encrypted snapshots.
This keeps editorial workflow metadata from changing the document format and
prevents a pending approval from silently following a copied file.

The page keeps at most 50 proposals. Refreshing the page clears them. A later
phase may add an encrypted account-level audit log, but it must not weaken the
portable-file or explicit-pairing boundaries.

## Concurrency and safety

- Proposal creation requires the current monotonic editor revision.
- Any intervening user, collaborator, agent, undo, or redo mutation makes a
  pending proposal stale.
- Permanent IDs for proposed objects are allocated at proposal creation, then
  the same prepared operations are applied after approval.
- Preflight must produce a valid `bento/slides` document and is read-only.
- Approval rechecks status and revision immediately before committing.
- Broad and destructive workflows use proposals; existing narrow direct tools
  remain available for explicitly requested edits.

## Acceptance boundary

The first complete slice requires proposal submission and inspection through
MCP, a visible editor review card, human approve/reject controls, stale-state
feedback and linked replacement proposals, stale-state feedback after manual edits, atomic application, undo/redo compatibility, and
tests proving that agents cannot approve their own proposals.

Review cards derive an exact change list from prepared operations and render up
to three affected slides before and after the preflighted batch. Created and
deleted slides show an explicit empty endpoint; destructive operations receive
a warning. Preview images remain page-local and are not transferred through
MCP or saved with the document.

After approval, the editor snapshots the applied revision and verifies up to
ten affected slides in its serialized inspection queue. It renders the actual
applied result and checks overflow, off-canvas content, possible overlap, and
measurable contrast. Verification is page-local, read-only, and independent of
the proposal's `applied` status. Compact history reports checking, passed,
failed, or issue-count state; expanded history shows per-slide evidence.
Intervening edits mark results as belonging to an earlier revision. MCP status
includes structured findings but not the browser-local rendered images.
