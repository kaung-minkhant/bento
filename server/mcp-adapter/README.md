# bento MCP adapter

This package exposes the encrypted document service through the standard MCP
protocol. It is agent-agnostic: Claude, ChatGPT, local models, and other MCP
clients can use the same endpoint.

The adapter never decrypts stored snapshots or receives a document password,
vault key, or relay key. Metadata and session tools use the document service.
Content tools require an explicit browser bridge connection and then read or
replace the open document through the editor's normal undoable mutation path.

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
```

`MCP_ALLOWED_DOC_IDS` is a deployment-level allowlist. Even without it, every
document tool requires an explicit `docId` and the document service enforces
the token subject's membership and role. `BENTO_AGENT_BRIDGE_TOKEN` enables
browser connections; omit it to disable content tools.

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
