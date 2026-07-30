---
name: bento-slides
description: >-
  Create, edit, review, and refine bento/slides presentations through the bento
  MCP tools or by safely editing a standalone .bento.html file. Use whenever a
  user asks an agent to build a deck, turn source material into an academic or
  professional presentation, redesign slides, add charts/media/math/motion,
  inspect deck quality, or run a human-approved proposal workflow.
---

# Author bento/slides decks

Choose the access path before acting:

- **Paired editor:** If `bento` or `bento-local` MCP tools are available and
  the user provides a pairing code or identifies an open deck, use MCP. Do not
  bypass the editor by modifying a file.
- **Standalone file:** If the task targets a `.bento.html` file without an MCP
  connection, follow [direct-file-authoring.md](references/direct-file-authoring.md).
- **Neither:** Ask the user to open and pair a deck, or provide the file.

## MCP workflow

1. Claim the pairing code when needed. Keep the returned `docId` for every
   subsequent call.
2. Call `get_authoring_guide` for `overview` and `workflow`. Load only the
   additional topics needed: `recipes`, `operations`, `elements`, `motion`,
   `math-media-svg`, `safety`, or `examples`. Treat this live guide as the
   authoritative schema; do not rely on memorized tool fields.
3. Inspect before editing with `get_deck_summary`, `get_deck_style`, and
   `inspect_design_system`. For an existing deck, inspect relevant slides and
   render them. For a new multi-slide deck, first outline the narrative and
   assign each slide a distinct job.
4. Read [deck-craft.md](references/deck-craft.md) before creating or broadly
   redesigning slides. Preserve the deck's visual language unless the user
   explicitly requests a new one.
5. Prefer a built-in composition recipe when its structure fits. Otherwise
   use targeted operations with stable slide and element IDs.
6. Use a revision-guarded dry run for narrow, explicitly requested edits, then
   apply the identical batch only if the revision is unchanged. Use a proposal
   for broad, destructive, multi-slide, or judgment-heavy work. Read
   [transactional-review.md](references/transactional-review.md) whenever a
   proposal or human review is involved.
7. Render every materially changed slide and run `validate_slide`. For a full
   deck or major redesign, also run `inspect_deck_quality`; treat its findings
   as hypotheses and visually inspect cited slides.
8. Finish only after checking narrative flow, visual variety, overflow,
   contrast, editability, speaker notes, and presentation behavior.

## Non-negotiable rules

- Use stable IDs and current revisions; never address slides by index during
  mutation.
- Never regenerate an existing `docId`.
- Keep content editable: prefer native text, shapes, charts, tables, images,
  and media over flattening a slide into SVG or a bitmap.
- Do not replace the entire document for a targeted change.
- Do not approve an agent proposal. Approval belongs only to the person in the
  editor.
- Do not assume a successful mutation looks good. Render and validate it.
- Keep the deck self-contained when the user needs offline portability; call
  out any external media or image dependency.
