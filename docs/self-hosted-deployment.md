# Self-hosted deployment

The first deployment target is Kubernetes with Flux GitOps:

```text
GitHub bento repository
  -> GitHub Actions
  -> GitLab Container Registry
  -> Flux ImageRepository/ImagePolicy
  -> Flux ImageUpdateAutomation
  -> GitHub homeserver-gitops
  -> Kubernetes
```

The deployed components are:

- `bento-slides`: static Vite frontend at `slides.kaungminkhant.space` and
  `kaungminkhant.space/slides`.
- `bento-document-service`: internal API service on port `8789`.
- `bento-mcp-adapter`: authenticated MCP and browser bridge service at
  `https://slides.kaungminkhant.space/mcp`.
- `bento-document-migrate`: one-shot Postgres migration Job.

The sync relay remains a separate Cloudflare Worker. It is not part of this
Kubernetes deployment.

## GitHub Actions

Add these GitHub Actions secrets to the bento repository:

```text
GITLAB_REGISTRY_USERNAME
GITLAB_REGISTRY_PASSWORD
```

The password should be a GitLab deploy token or project access token that can
push to:

```text
registry.gitlab.com/james-homelab/bento/document-service
registry.gitlab.com/james-homelab/bento/frontend
registry.gitlab.com/james-homelab/bento/mcp-adapter
```

The workflow is `.github/workflows/images.yml`. It builds all three images and tags
them as `build-{run-number}-{commit}`. It does not deploy directly.

## GitOps prerequisites

The non-secret manifests are in the GitOps repository at:

```text
apps/base/bento-document-service/
apps/production/bento-document-service/
```

Create a SOPS-managed Secret named `bento-document-service-secrets` in the
`bento-prod` namespace with these keys:

```text
DATABASE_URL
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
BENTO_API_TOKEN       # optional agent fallback
OIDC_CLIENT_ID        # public Zitadel SPA client id
OIDC_AUDIENCE         # Zitadel API project ID
```

Set `OIDC_ISSUER_URL` as a non-secret deployment value. For the current
installation it is `https://authz.kaungminkhant.space`. Register the public
frontend routes (`https://slides.kaungminkhant.space/`,
`https://slides.kaungminkhant.space/library`,
`https://kaungminkhant.space/slides/`, and
`https://kaungminkhant.space/slides/library`) as Zitadel redirect URIs and
enable authorization code with PKCE. The browser obtains a short-lived
access token; the service validates its signature and `sub` against Zitadel's
JWKS. `BENTO_API_TOKEN` remains the document-service credential used by the MCP
adapter's backend client; MCP clients use the separate `MCP_ACCESS_TOKEN`.

Add `MCP_ACCESS_TOKEN` and `BENTO_AGENT_BRIDGE_TOKEN` to the same Secret. The
MCP adapter uses `BENTO_API_TOKEN` as its document-service credential, while
the other two keys are dedicated credentials for MCP clients and browser
pairing. The deployment intentionally does not include this Secret or inspect
existing secret files.

The image-pull and Flux registry Secret is referenced as:

```text
bento-gitlab-registry
```

It must exist in `bento-prod` and contain credentials that can read the two
GitLab images. The same secret is used by the Flux `ImageRepository` resources.

## SeaweedFS

The application uses the in-cluster S3 endpoint:

```text
http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333
```

Create the bucket named `bento-documents` using the SeaweedFS S3 credentials
placed in `bento-document-service-secrets`. The service uses path-style S3
requests because that matches the cluster-local endpoint.

## Postgres

Create a dedicated database and user externally, then place its connection URL
in `DATABASE_URL`. The migration Job runs:

```text
node dist/migrate.js
```

It creates the `pgcrypto` extension, a `schema_migrations` table, and the
document-service tables. The migration is idempotent after the initial version
is recorded.

## Reconciliation

After committing the application and GitOps changes, Flux should discover the
new image tags and reconcile the `bento-prod` overlay. Useful non-secret checks
are:

```sh
kubectl -n bento-prod get pods,svc,ingress
kubectl -n bento-prod logs job/bento-document-migrate
kubectl -n bento-prod rollout status deployment/bento-slides
kubectl -n bento-prod rollout status deployment/bento-document-service
```

The frontend is public through the Traefik Ingress. The document service and
MCP adapter remain ClusterIP workloads. The subdomain routes authenticated
document requests under `/api` and MCP traffic under `/mcp`, `/pairings`, and
`/bridge`. The path deployment exposes the same routes under `/slides/*` and
strips `/slides` before forwarding to the workloads. MCP clients still need
the `MCP_ACCESS_TOKEN` bearer token.

## Current readiness boundary

This deployment proves the container, frontend, Postgres migration, SeaweedFS
configuration, Flux image flow, frontend ingress, and the authenticated
document API storage slice. Zitadel login is wired but requires the project
client id and API audience to be configured. Live sessions and the document
explorer remain later phases.
