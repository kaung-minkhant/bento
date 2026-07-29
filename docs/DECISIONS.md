# Decision log

Append-only. Newest first. One entry per settled decision that a parallel
agent (or future session) might otherwise re-open or contradict. Keep entries
to a few lines: **what** was decided, **why**, and where the details live.
Reversing a decision = a new entry that supersedes the old one, not an edit.

Format:

```
## YYYY-MM-DD — Title
Decision. Why. Pointers.
```

---

## 2026-07-29 — Quality scoring measures meaningful content, not model complexity
Density ignores decorative/background geometry and combines word count with
occupied visual area; nearby colors and radii form families; heterogeneous
decks soften typography penalties. Data visualizations without a visible
assertion are checked explicitly. This calibration prevents richly constructed
but visually sparse slides from being penalized for raw element count.

## 2026-07-29 — Deck-quality diagnostics are conservative and read-only
`inspect_deck_quality` reports evidence-backed hierarchy, density, rhythm,
consistency, variety, and narrative findings against stable slide/element ids.
Its score is triage, not an aesthetic truth, and it never edits automatically;
agents should inspect/render the cited slides before proposing corrections.

## 2026-07-29 — Composition recipes have one engine for UI and MCP
Recipe definitions own structured fields, sample previews, and ordinary slide
generation. The New Slide picker and revision-guarded MCP tools call that same
engine, so recipes remain fully editable and cannot drift between agent and
human authoring. Recipes consume advisory design tokens with deck-theme
fallbacks; they do not introduce a new rendered document primitive.

## 2026-07-29 — Phase 8 design tokens begin as advisory composition metadata
`theme.design` stores optional named color, typography, spacing, and radius
tokens, while `inspect_design_system` also infers the visual language actually
used by the deck. Existing element properties remain the rendered source of
truth in this first slice, so adding or editing token metadata cannot silently
restyle shipped documents. Recipes may consume tokens in the next slice.

## 2026-07-24 — Naming: the platform is `bento`, the mark is `bento/.`, all lowercase
Settled after working through the whole namespace. **Do not reopen these** —
each rejected candidate was rejected for a specific reason, recorded below.

- **Platform: `bento`** (lowercase). Not "Bento Box", not "Bento Suite" — the
  bare word is the family, and `bento/<app>` reads as members of it.
- **Wordmark: `bento/.`** — the trailing dot stands for the platform (the apps
  complete the slash). This is a MARK, not a name: `/` is a path separator and
  is illegal in filenames, URLs, package names and social handles, and
  punctuation is disregarded for trademark purposes. Anywhere a name must be
  stored or typed, it is `bento`.
- **Casing: lowercase everywhere**, brand and machine alike. This deliberately
  collapses the usual split (`Docker` the brand / `docker` the command)
  because the lowercase form is already the file's own identity — `doc.type`
  is `bento/slides`, the MIME type is `application/bento+json`.
- **Apps:** `bento/slides` (shipped), `bento/spaces` (Notion/notes-like),
  `bento/dash` (spreadsheet + tables + dashboards — absorbs what would have
  been a separate database app), `bento/vault` (document library / personal
  storage). A word-processor app is planned; **`bento/folio` is the proposed
  name, NOT yet confirmed** (alternatives considered: draft, prose, write —
  `pages` and `docs` are unusable, being Apple's and Google's).

**Rejected, with reasons:** `box` — the natural collective noun, and Box, Inc.
is a cloud-storage company; keep it as an informal collective at most.
`base` — retired once dash absorbed tables; also reads as "database", which
this platform does not have. `bits` — generic, tonally wrong for an editorial
brand, and pushes search toward snack food. `page`/`pages` — reserved: it is
the best name for a future web-publishing app, and Apple Pages owns the
word-processor association. `shelf`/`library` — weaker than vault, and library
reads as "code library" to this audience.

**Note on the crowded namespace:** several unrelated SaaS products are called
Bento (email automation, link-in-bio, analytics, a dead FileMaker database).
The field is crowded, which weakens everyone's claim — including ours. The
practical cost is discoverability, not legal exposure. Mitigation is the
`bento/<app>` form, the `bento.page` domain, and always carrying the
descriptor. Get real clearance before commercialising; a bare wordmark would
be hard to register, a composite (mark + logo) much less so.

## 2026-07-24 — bento/vault holds the map, not the keys
The document library must not become a custody service. It stores an encrypted
index of what documents exist and how they reference each other; each document
keeps its own encryption password and collab credentials. Compromising the
vault reveals *what you have*, not what is in it, and losing the vault loses an
index, not your work. This preserves the property that makes the relay
defensible — files stay authoritative, server loss is survivable — and keeps
the name an honest promise. Any sync tier is E2EE and optional (DO for
coordination + R2 for encrypted blobs; never D1/plaintext), and self-hostable.

## 2026-07-25 — Self-hosted document storage uses SeaweedFS and Postgres
The first self-hosted document-service target uses SeaweedFS through its
S3-compatible API for encrypted document blobs and Postgres for the encrypted
library index, ownership, permissions, versions, recovery checkpoints, and
session metadata. Durable versions are immutable; autosave checkpoints are
replaceable and expire. The service never stores document plaintext, document
passwords, or collaboration keys.

## 2026-07-24 — Suite expansion: bento/spaces and bento/dash
Two new apps begin: **bento/spaces** (Notion/notes-like) and **bento/dash**
(spreadsheet + tables). Development fans out across parallel
agents and multiple tools (Claude Code, Codex, Antigravity) — coordination
rules in `docs/PARALLEL-WORK.md`, platform contract in `docs/PLATFORM.md`.
Planned pre-fan-out groundwork: extract the shared kernel (monorepo layout,
apps beside `slides/`), add per-PR CI validation gates (typecheck +
build:single + splice conformance + test-sync). Releases stay local/signed
regardless of CI.

## 2026-07-24 — Hold marketing-surface i18n
Don't localize the bento.page landing page or README yet: the landing page
will be rebuilt around the multi-app suite, so translations now would only
drift. App UI i18n (7 locales) is the localization that matters and already
ships. Revisit once the new landing page is stable.

## 2026-07-24 — No bot/AI-agent identities in git history
External PRs get provenance review before merge (`gh api users/<login>`);
scatter-bot/AI-agent contributions are declined. A bot's merged PR was
scrubbed from history via filter-repo + force-push, and `main` is now
branch-protected (1 required review, no force-pushes). Human contributors'
authorship is preserved normally.

## 2026-07-22 — v1.0.7 launch (Show HN) and post-launch fixes
Launched publicly (#1 on HN, ~1000 pts). Post-launch priorities were driven
by thread feedback: collab focus-steal fix, chart zero-baseline for negative
values, mobile-Safari pinch, reduce-motion mode — all shipped in v1.0.8
alongside panel UI for community format features (text gradient, text-stroke,
blur/blend, backdrop-filter). Community format features are accepted when
additive + composable (unknown fields preserved; effects compose).

## v1.0.7 — Morph identity decoupled from element id
Elements carry optional `morphId` overriding the morph pairing;
`data-flip-id = morphId || id`. `id` stays the stable identity (selection,
anchors, CRDT). Chosen over mutating ids, which would have broken comment
anchors and collab node identity. Details: CLAUDE.md (render.ts section).

## v0.9.x — Charts are in-house (ECharts removed)
ECharts was 630KB (~47% of the shell); replaced with charts-lite interpreting
the same option SHAPE (pure JSON, no functions). Exotic configs degrade
gracefully rather than crash. Don't re-add a chart dependency; extend
charts-lite instead. Details: CLAUDE.md (charts section).

## v0.9.x — Collab credentials mint-at-creation, dormant until shared
Decks are born collab-capable but never auto-connect unless the doc arrived
carrying collab or the user opted in — fresh templates/demos must never phone
home. Read-only and writer roles are enforced cryptographically at the blind
relay, not honour-system. Spec: docs/collab-design.md.

## v0.x — Releases are cut locally, never in CI
The signing key never leaves the maintainer's machine; the signed bytes are
the served bytes. CI may validate (typecheck/build/gates) but never signs,
publishes, or deploys. Runbook: docs/RELEASING.md.

## v0.x — Single-file architecture is the product
One HTML file = document + viewer + editor, working offline from file://.
The splice contract on `#bento-doc` is frozen forever (shipped updaters
depend on it). Everything else is negotiable; this isn't. See
docs/PLATFORM.md §1–2.
