# Upstream Sync

This fork is based on `https://github.com/nyblnet/bento`.

## Scan watermark

The latest fully scanned upstream commit is:

```text
5e32684
```

Last scanned: 2026-07-26

The next scan starts with commits after `5e32684`:

```sh
git fetch upstream
git log --oneline 5e32684..upstream/main
```

Update the watermark only after every intervening upstream commit has been
reviewed and classified as ported, intentionally skipped, or deferred.

## Porting policy

- Evaluate changes against `main`; `personalize` is temporary.
- Do not merge upstream wholesale. This fork owns the hosted document service,
  OIDC integration, deployment files, and related frontend behavior.
- Port behavior, not necessarily upstream implementation details.
- Preserve backward compatibility with existing `.bento.html` documents.
- Add focused tests for normal cases, edge cases, regressions, and compatibility
  before marking a change ported.
- Keep coordinated client/relay changes together and verify both sides before
  marking them complete.

## Completed from the current scan

- Slide deletion safety, morph-key handling, large-text CRDT safety, and diff
  failure recovery.
- Theme-aware table defaults, blank-deck reset, and save-picker naming.
- Temml math rendering, symbol-level math morphing, and starter-deck examples.
- Explicit morph unpairing, truthful save capability messaging and browser
  recovery feedback, and best-effort screen wake lock while presenting.
- Encrypted media blob offload, relay refusal signaling, frame-ID correlation,
  per-room quotas, expiry cleanup, and client-side blob caching/deduplication.
- Large asset CRDT references and image/media insertion integration.

## Deployment note

- The ported relay implementation expects its `BLOBS` binding to an R2-style
  object store. Without that binding it returns `501` and the client falls back
  to inline assets. SeaweedFS support for the sync relay is separate from the
  document service's existing SeaweedFS integration and is not implied by this
  client port.

## Intentionally not ported

- Release automation, updater UI, and release-note changes. The updater is
  disabled while the hosted deployment is stabilized, and releases remain
  maintainer-owned.
- i18n packing and new language-pack infrastructure. This fork keeps authored
  catalogs bundled while its hosted/OIDC strings are still evolving.
- Upstream starter-title and broad rebrand changes. They conflict with the
  repository's lowercase naming contract and the fork's product copy.
- Upstream relay/vault design documents and CI/site changes that describe or
  deploy the upstream service topology rather than this fork's deployment.

## Review record

For each future scan, add a dated section containing the scanned range, commit
classification, port commits, deferred commits, and verification results.
