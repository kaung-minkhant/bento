# bento MCP adapter

This package exposes the encrypted document service through the standard MCP
protocol. It is agent-agnostic: Claude, ChatGPT, local models, and other MCP
clients can use the same endpoint.

The adapter is deliberately metadata/session-only in this phase. It never
decrypts or returns a `.bento.html` snapshot, document password, vault key, or
relay key. Later browser-mediated mutation tools will use the editor's normal
document-model path so undo, collaboration, autosave, and export keep working.

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
```

`MCP_ALLOWED_DOC_IDS` is a deployment-level allowlist. Even without it, every
document tool requires an explicit `docId` and the document service enforces
the token subject's membership and role.

HTTP MCP endpoint:

```sh
npm install
npm run build
DOCUMENT_SERVICE_URL=... DOCUMENT_SERVICE_TOKEN=... npm start
```

Configure an MCP client with `http://127.0.0.1:8790/mcp` or the HTTPS URL of a
reverse-proxied deployment. For local stdio clients use `npm run start:stdio`
with the same environment.
