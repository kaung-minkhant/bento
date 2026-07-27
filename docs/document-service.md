# bento document service

Status: design draft. This is the first storage/API slice for a self-hosted
document library. It assumes SeaweedFS exposes an S3-compatible endpoint and
Postgres stores the encrypted index and service metadata.

This service is separate from the blind live-sync relay. The relay carries
encrypted collaboration frames; this service stores document snapshots,
recovery checkpoints, and the encrypted library index.

## Storage boundary

### SeaweedFS S3

SeaweedFS stores opaque encrypted objects. The service must never need the
document password or plaintext `#bento-doc` contents.

Object keys are service-generated and must not be derived from document titles:

```text
documents/{doc_id}/versions/{version_id}.bento.html.enc
documents/{doc_id}/recovery/{checkpoint_id}.bento.html.enc
```

Durable version objects are immutable. Recovery objects are replaceable and
short-lived. S3-compatible checksums may be stored for integrity, but they are
checksums of ciphertext and do not provide a content-search index.

### Postgres

Postgres stores ownership, access, encrypted index data, object references, and
timestamps. Plaintext document content, document passwords, and collaboration
keys must not be stored here.

The encrypted index payload is client-produced. It may contain the document
title, app/format, tags, and other library metadata. The client decrypts it
after opening the document. Content search is client-side after a document is
opened.

## Schema

The following is the logical schema. Exact SQL types and migration tooling are
implementation choices for the service package.

### `documents`

One row per logical document.

| Column | Meaning |
|---|---|
| `doc_id` | Stable Bento `docId`; primary key. Never regenerated during ordinary saves. |
| `owner_subject` | Authenticated subject that owns the document. |
| `format` | Document format, such as `bento/slides`. |
| `current_version_id` | Latest durable version, nullable during creation. |
| `metadata_ciphertext` | Client-encrypted library metadata. |
| `metadata_nonce` | Nonce/IV for the metadata envelope. |
| `metadata_version` | Version of the metadata envelope. |
| `created_at` | Creation timestamp. |
| `updated_at` | Last durable or recovery activity timestamp. |
| `deleted_at` | Soft-delete timestamp, nullable. |

The database may index `owner_subject`, `format`, `updated_at`, and
`deleted_at`. It must not index plaintext title or content.

### `document_versions`

Immutable, user-visible document snapshots.

| Column | Meaning |
|---|---|
| `version_id` | Service-generated UUID; primary key. |
| `doc_id` | Parent document. |
| `object_key` | SeaweedFS object key. |
| `ciphertext_sha256` | Integrity digest of the stored object. |
| `byte_size` | Stored ciphertext size. |
| `created_by_subject` | Actor that created the version. |
| `parent_version_id` | Previous durable version, nullable for the first version. |
| `created_at` | Version creation timestamp. |
| `label_ciphertext` | Optional client-encrypted user label. |

Creating a durable version and moving `documents.current_version_id` must be
one Postgres transaction. The blob upload is completed and verified before the
transaction commits; abandoned uploads are cleaned separately.

### `document_recovery`

Replaceable crash-recovery checkpoints. These are deliberately not part of
`document_versions` and are not shown as permanent version history.

| Column | Meaning |
|---|---|
| `doc_id` | Parent document; unique for the active checkpoint. |
| `object_key` | SeaweedFS recovery object key. |
| `ciphertext_sha256` | Integrity digest of the stored object. |
| `byte_size` | Stored ciphertext size. |
| `created_by_subject` | Client or session that wrote the checkpoint. |
| `created_at` | Checkpoint timestamp. |
| `expires_at` | Cleanup deadline. |

An autosave replaces the active checkpoint for a document. Retention and
cleanup are service policy, not document semantics.

### `document_members`

Account-level access control for the library service.

| Column | Meaning |
|---|---|
| `doc_id` | Parent document. |
| `subject` | Authenticated user/service subject. |
| `role` | `owner`, `editor`, or `reader`. |
| `created_at` | Membership creation timestamp. |
| `revoked_at` | Revocation timestamp, nullable. |

This controls access to stored objects and sessions. It does not replace the
document's own collaboration credentials or signed-write checks.

### `document_sessions`

Service metadata for live sessions. The session payload does not contain a
document key.

| Column | Meaning |
|---|---|
| `session_id` | Service-generated UUID; primary key. |
| `doc_id` | Parent document. |
| `relay_room` | Opaque reference to the sync relay room. |
| `created_by_subject` | Session creator. |
| `created_at` | Session start timestamp. |
| `last_seen_at` | Last known activity. |
| `closed_at` | Session close timestamp, nullable. |

The existing sync relay remains responsible for encrypted CRDT frames. This
table is a library/service record, not a replacement for relay state.

## API contract

All endpoints are under `/api/v1` and require authentication. Responses use
JSON unless an endpoint explicitly returns an encrypted document object.

### Account vault key

The browser generates one random 256-bit vault key per account. It wraps that
key with a recovery password using PBKDF2-SHA-256 and AES-GCM, then stores only
the wrapped envelope here. The service never receives the recovery password or
the unwrapped vault key.

```http
GET /api/v1/vault/key
```

Returns `{ "wrappedKey": null }` before first-device setup, or an opaque
`wrappedKey` envelope afterward.

```http
POST /api/v1/vault/key
Content-Type: application/json
```

Request:

```json
{
  "wrappedKey": {
    "ciphertext": "base64url",
    "salt": "base64url",
    "nonce": "base64url",
    "version": 1
  }
}
```

Creation is one-time per authenticated account. A second creation attempt
returns `409 vault_key_exists`; key rotation is intentionally deferred.

### Create a document

```http
POST /api/v1/documents
Content-Type: application/json
```

Request:

```json
{
  "docId": "client-generated-uuid",
  "format": "bento/slides",
  "metadata": {
    "ciphertext": "base64url",
    "nonce": "base64url",
    "version": 1
  },
  "initialVersion": {
    "ciphertext": "base64url",
    "sha256": "base64url",
    "byteSize": 12345
  }
}
```

The service validates identity and envelope shape, stores the encrypted blob,
and creates the document plus its first durable version. It does not parse the
document contents.

### List documents

```http
GET /api/v1/documents?cursor=...&limit=50
```

Returns the caller's accessible document records and encrypted metadata. The
client decrypts metadata locally. The endpoint supports cursor pagination and
excludes soft-deleted documents by default.

### Read document metadata

```http
GET /api/v1/documents/{docId}
```

Returns document identity, format, timestamps, current version information,
membership role, and encrypted metadata. It does not return plaintext
content.

### Delete a document

```http
DELETE /api/v1/documents/{docId}
```

Only the owner may delete a document. The service records a deletion tombstone
and removes its durable-version and recovery blobs from SeaweedFS on a
best-effort basis. Deleted documents no longer appear in the library or pass
document access checks.

### Download a durable version

```http
GET /api/v1/documents/{docId}/versions/{versionId}/content
```

The service either streams the ciphertext or returns a short-lived authorized
download URL. The client decrypts and validates the resulting `.bento.html`.

### Save a durable version

```http
POST /api/v1/documents/{docId}/versions
Content-Type: application/json
```

Request contains the encrypted snapshot object, ciphertext digest, size,
optional encrypted label, and optional parent version. The caller must have
the `editor` or `owner` role. Parent-version conflicts return `409` so the
client can reconcile before creating a new version.

### Write recovery checkpoint

```http
PUT /api/v1/documents/{docId}/recovery
Content-Type: application/json
```

The caller must have write access. This replaces the active recovery
checkpoint and accepts an expiration time. It never advances the durable
version pointer and is safe to clean after expiry.

### List durable versions

```http
GET /api/v1/documents/{docId}/versions
```

Returns immutable version metadata and encrypted labels. It does not include
recovery checkpoints.

### Start or resume a session

```http
POST /api/v1/documents/{docId}/sessions
```

Creates or resumes service metadata for a live session and returns an opaque
session reference plus the configured relay endpoint. The document key and
encrypted relay payload remain client-owned. Session authorization must be
checked against `document_members` before returning the reference.

### Revoke or close a session

```http
DELETE /api/v1/documents/{docId}/sessions/{sessionId}
```

This closes the service record and asks the client/relay integration to stop
the session. Key rotation remains the document-level mechanism for revoking
previously distributed collaboration credentials.

## Versioning policy

The service must not create a durable version for every keystroke or CRDT op.

- CRDT operations remain in the live session/relay layer.
- Autosave writes the replaceable recovery checkpoint.
- Explicit save, named checkpoint, or a controlled periodic milestone creates
  an immutable durable version.
- Recovery objects expire automatically.
- Durable version retention is configurable per deployment.

This gives crash recovery without turning normal editing into an unbounded
version stream.

## Non-goals for this slice

- MCP tools
- Full document-library UI
- Server-side content search
- Plaintext metadata indexes
- Server-side decryption
- Replacing the existing sync relay
