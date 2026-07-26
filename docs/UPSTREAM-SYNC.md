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

## Deferred

- Encrypted media blob offload and relay refusal protocol changes. These require
  coordinated sync-client and relay work and must be ported as one tested batch.

## Review record

For each future scan, add a dated section containing the scanned range, commit
classification, port commits, deferred commits, and verification results.
