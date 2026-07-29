# Agent proposals

Phase 9 adds a human approval boundary for broad or destructive agent changes.
This document defines the first implementation contract.

## Lifecycle

An agent submits a title, optional rationale, the current document revision,
and a normal `apply_operations` batch. The editor fully prepares and preflights
that batch against a cloned document before accepting the proposal.

Proposals have four observable states:

- `pending` — valid at its base revision and waiting for a person.
- `applied` — approved by a person and committed atomically.
- `rejected` — declined without changing the document.
- `stale` — the document revision changed before approval.

Approval applies the prepared batch as one normal store commit and therefore
one undo checkpoint. A rejected, stale, or applied proposal cannot be reused.
Agents can submit and inspect proposals, but cannot approve them through MCP.

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
feedback after manual edits, atomic application, undo/redo compatibility, and
tests proving that agents cannot approve their own proposals.
