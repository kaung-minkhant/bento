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

- `bento-slides`: static Vite frontend at `slides.kaungminkhant.space`.
- `bento-document-service`: internal API service on port `8789`.
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
```

The workflow is `.github/workflows/images.yml`. It builds both images and tags
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
```

The deployment intentionally does not include this Secret or inspect existing
secret files.

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

The frontend is public through the Traefik Ingress. The document service is
ClusterIP-only until authenticated document APIs are implemented.

## Current readiness boundary

This deployment proves the container, frontend, Postgres migration, SeaweedFS
configuration, Flux image flow, and frontend ingress. The document API still
contains placeholder `501` routes until authentication and CRUD are added.
