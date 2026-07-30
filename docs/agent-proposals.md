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

Verification compares validation findings from the pre-apply snapshot with the
applied snapshot using finding type and stable element ids. Only newly
introduced findings contribute to the proposal's issue count; pre-existing
findings remain visible but do not make the proposal fail. Expanded evidence
includes readable element text, stable ids, and measured-bound overlays on the
rendered slide so reviewers can locate each finding.

When verification finds a newly introduced issue at the current revision, a
person may request a follow-up from the expanded applied proposal. The request
contains editable guidance and does not change the deck. It appears through
`list_agent_proposals`; an agent responds with `propose_operations` and
`followsProposalId`. Successful preflight links a new pending proposal to the
applied source. The follow-up still requires normal human approval, and only
one follow-up request may be opened from each applied proposal.

## Event waiting

Proposal responses expose a monotonic page-local `eventCursor`. After
submitting or inspecting a proposal, an agent can call
`wait_for_agent_event` with that cursor and an optional proposal id. The
browser retains the latest 100 events, so feedback that arrives between the
proposal response and the wait call is returned immediately rather than lost.
Waits return on change requests, approval, rejection, verification completion,
or follow-up requests. A bounded timeout returns a compact unchanged result,
not an error. Waiting is read-only, consumes no model tokens while blocked,
and is cancelled when the browser bridge disconnects.
