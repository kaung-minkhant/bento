# Transactional review

Use this workflow for broad, destructive, multi-slide, or judgment-heavy
changes.

## Propose

1. Inspect a fresh revision and all affected slides.
2. Submit one coherent batch with `propose_operations`, a concrete title, and
   a short summary of intent. The proposal preflight must succeed without
   changing the deck.
3. Retain the returned proposal ID and `eventCursor`.
4. Tell the person that the exact operations, affected slides, warnings, and
   before/after evidence are ready in the editor.
5. Call `wait_for_agent_event` with the cursor and proposal ID. Waiting is
   read-only and avoids asking the person to return to chat.

## React to events

- `changes_requested`: incorporate the exact feedback into a complete revised
  batch and submit it with `replacesProposalId`. Do not directly apply it.
- `proposal_applied`: wait again from the returned cursor for
  `verification_completed`.
- `verification_completed`: distinguish newly introduced findings from
  pre-existing findings. Do not claim a pre-existing issue was caused by the
  proposal.
- `follow_up_requested`: submit the corrective proposal with
  `followsProposalId`; it still requires human approval.
- `proposal_rejected`: stop that line of work unless the person asks for a new
  approach.
- stale proposal or stale revision: re-inspect the current deck, reconcile the
  user's intervening edit, and create a new proposal. Never replay the old
  batch blindly.
- timeout: retain the returned cursor and wait again when appropriate. The
  proposal remains pending, and buffered events are returned on the next wait.

## Approval boundary

Never invoke or simulate approval. Do not use a narrow direct-edit tool to
circumvent requested review. An approved proposal applies atomically as one
normal undo checkpoint.
