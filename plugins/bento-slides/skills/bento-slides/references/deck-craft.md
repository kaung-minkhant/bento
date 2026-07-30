# Deck craft

Read this before creating a deck or broadly redesigning slides.

## Build the story first

- Give every slide one job: orient, assert, explain, compare, demonstrate,
  prove, transition, or decide.
- Outline the narrative before creating multiple slides. A useful default is
  context → tension/question → evidence → interpretation → decision/next step.
- For academic work, preserve the paper's claim strength, methods, units,
  uncertainty, limitations, and citations. Separate reported results from
  interpretation.
- Write concise speaker notes so the slide can stay visual without losing the
  talk track.

## Match composition to content

- Quantitative comparison or trend → native chart.
- Structured feature/specification comparison → native table.
- Process, chronology, or causal chain → spatial sequence with connectors.
- One decisive claim → assertion-led composition with supporting evidence.
- Consecutive states of the same subject → morph shared elements deliberately.
- Presenter-paced explanation → build steps; elements sharing a step reveal
  together.
- Hero image or media → give it compositional purpose, a readable text zone,
  and an offline strategy.

Do not turn every slide into the same title-plus-cards template. Vary density,
alignment, scale, and composition according to the slide's job while retaining
the deck's palette and typography.

## Maintain hierarchy

- Make the intended reading order obvious at a glance.
- Use one dominant idea, restrained supporting copy, and meaningful whitespace.
- Keep body text readable in presentation conditions; render to verify actual
  wrapping rather than estimating from JSON.
- Use color for hierarchy and state, not decoration. Check measurable contrast.
- Reuse named design tokens and roles when the deck has them.

## Use motion intentionally

- Use transitions for slide-level continuity and entrance effects for element
  reveals; do not confuse the two.
- Use morph only when continuity teaches something. Preserve stable identity or
  use unique matching `morphId` values.
- Treat build steps as presenter-controlled disclosure. A built element hidden
  on arrival does not participate in the incoming morph; its entrance effect
  plays when revealed.
- Respect reduced motion and verify transitions, builds, links, and media in
  presentation mode.

## Final visual pass

- Render every changed slide.
- Fix overflow, off-canvas content, accidental overlap, weak contrast, and
  inconsistent alignment.
- Inspect thumbnails for rhythm, repetition, and abrupt style changes.
- Confirm charts and tables communicate the intended comparison accurately.
- Confirm all content remains editable and external dependencies are disclosed.
