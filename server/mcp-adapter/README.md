# bento MCP adapter

This package exposes the encrypted document service through the standard MCP
protocol. It is agent-agnostic: Claude, ChatGPT, local models, and other MCP
clients can use the same endpoint.

The adapter never decrypts stored snapshots or receives a document password,
vault key, or relay key. Metadata and session tools use the document service.
Content tools require an explicit browser bridge connection and then inspect or
change the open document through the editor's normal undoable mutation path.
Agents should prefer the targeted tools (`get_deck_summary`, `get_deck_style`, `inspect_design_system`, `get_slide`, `render_slide`,
`render_deck_thumbnails`, `validate_slide`, `apply_operations`, `create_slide`, `add_text`,
`update_element`, `delete_element`, and `set_speaker_notes`) so small edits do
not transfer or overwrite the entire document. Rendering and validation are
read-only browser operations: they never alter document revision or history.
`apply_operations` prevalidates a revision-guarded batch and applies it as one
undo checkpoint; `dryRun: true` checks the batch without changing the deck.
Its operation vocabulary covers slide create/update/delete/reorder; text,
shape, image, SVG, chart, table, and media creation; type-aware element
updates and deletion; duplication; grouping; alignment; distribution; and
z-order. A creation operation may declare `clientId`, which later operations
in the same batch can use wherever a slide or element ID is expected.
The same batch vocabulary also supports deck theme/presentation updates,
safe embedded assets, built-in and custom layouts, and layout application.
Deck themes may carry advisory `design` token maps for named colors,
typography, spacing, and radii; these compose metadata for agents and recipes
without silently restyling existing elements.
`get_deck_style` reports layout and asset metadata without returning embedded
asset bytes.
`inspect_design_system` is read-only and reports declared design tokens plus a
statistical fingerprint of the deck's observed colors, typography roles,
spacing, radii, transitions, element mix, and recurring slide structures. It
lets an agent match the current visual language without transferring every
slide model.
`inspect_deck_quality` is a read-only whole-deck audit. It reports a triage
score and evidence-backed findings for hierarchy, density, spacing rhythm,
visual consistency, semantic-role coherence, repetitive composition, and
narrative flow. Its per-slide narrative map reports inferred titles, title and
role coverage, word counts, and purpose signals. Findings reference stable
slide/element ids and should be confirmed with rendering before an agent
proposes edits; fully untagged legacy decks are not penalized for absent roles.
Authoring knowledge is available before pairing through Markdown resources at
`bento://authoring/{overview,workflow,operations,elements,recipes,motion,math-media-svg,safety,examples}`.
Clients without strong MCP-resource support can call the read-only
`get_authoring_guide` tool by topic or request one operation directly. The
guide is versioned, and coverage tests keep implemented operations and recipe
ids represented in it.
Presenter-controlled builds use the common `buildStep` element property. Read
the `elements` and `motion` topics for grouping, reverse navigation, entrance
effects, reduced motion, and morph behavior before authoring them.
`list_composition_recipes` describes the shared structured recipe catalog.
`create_slide_from_recipe` creates a normal editable slide from one of those
recipes, adapts it to the deck's tokens/theme, and requires the current
revision so a stale request cannot overwrite concurrent work. The editor's
New Slide picker uses the same recipe definitions and generation engine.
The legacy
`agent_read_document` and `agent_replace_document` tools remain available for
clients that need full-document access.

## Run

Required environment:

```text
DOCUMENT_SERVICE_URL=https://documents.example.com
DOCUMENT_SERVICE_TOKEN=...
```

Optional environment:

```text
HOST=127.0.0.1
PORT=8790
MCP_ALLOWED_DOC_IDS=doc-uuid-1,doc-uuid-2
BENTO_AGENT_BRIDGE_TOKEN=...
MCP_ACCESS_TOKEN=...
```

`MCP_ALLOWED_DOC_IDS` is an optional deployment-level safety cap. Leave it
unset for normal use: pairing checks the requested document dynamically through
the document service, so users do not edit deployment configuration for every
new deck. Every document tool still requires an explicit `docId`, and the
document service enforces the token subject's membership and role.
`BENTO_AGENT_BRIDGE_TOKEN` enables browser connections; omit it to disable
content tools. For hosted decks, the browser forwards its current OIDC access
token for the one pairing authorization request; the adapter does not store
that token. Set `MCP_ACCESS_TOKEN` when the adapter is reachable by other
machines; MCP clients must send `Authorization: Bearer <token>`. Leave it
unset only when the adapter is bound to localhost or protected by an equivalent
trusted network boundary.

After starting the adapter, open the deck in bento/slides and click **Agent**.
Enter the adapter URL and click **Create pairing code**. Tell the MCP agent to
call `claim_agent_pairing` with the displayed short code. The browser connects
to that exact document after the agent claims it. Use HTTPS/WSS URLs for a
remote deployment; the browser must be open on the same document ID listed in
`MCP_ALLOWED_DOC_IDS`.

HTTP MCP endpoint:

```sh
npm install
npm run build
DOCUMENT_SERVICE_URL=... DOCUMENT_SERVICE_TOKEN=... npm start
```

Configure an MCP client with `http://127.0.0.1:8790/mcp` or the HTTPS URL of a
reverse-proxied deployment. For local stdio clients use `npm run start:stdio`
with the same environment.
