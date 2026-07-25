# bento document service

Self-hosted document storage for bento/vault. The service stores encrypted
document blobs in SeaweedFS through its S3-compatible API and stores the
encrypted library index plus access metadata in Postgres.

This package is intentionally separate from `server/sync-worker`: the sync
worker relays encrypted CRDT frames, while this service stores snapshots and
library metadata.

## Configuration

Required environment variables:

```text
DATABASE_URL=postgres://user:password@localhost:5432/bento
S3_ENDPOINT=http://localhost:8333
S3_REGION=us-east-1
S3_BUCKET=bento-documents
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Optional values:

```text
HOST=127.0.0.1
PORT=8789
S3_FORCE_PATH_STYLE=true
```

Run migration `migrations/001_initial.sql` against Postgres before starting
the service. The migration uses `gen_random_uuid()`, so the database must have
the `pgcrypto` extension enabled:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Development

```sh
npm install
npm run build
npm run dev
```

The current skeleton exposes `/healthz` and reserves the document API routes.
Authentication, repository transactions, presigned downloads, and the full
document API are added in the next slice; no development identity fallback is
provided by design.
