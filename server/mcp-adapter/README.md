# bento MCP adapter

This package exposes the encrypted document service through the standard MCP
protocol. It is agent-agnostic: Claude, ChatGPT, local models, and other MCP
clients can use the same endpoint.

The adapter never decrypts stored snapshots or receives a document password,
vault key, or relay key. Metadata and session tools use the document service.
Content tools require an explicit browser bridge connection and then inspect or
change the open document through the editor's normal undoable mutation path.
Agents should prefer the targeted tools (`get_deck_summary`, `create_slide`,
`add_text`, `update_element`, `delete_element`, and `set_speaker_notes`) so
small edits do not transfer or overwrite the entire document. The legacy
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
