---
title: Fork releases (GitHub release tarballs, not npm)
tags: [release, fork, ci, npm-pack]
tasks: [vk/9d5e-make-our-sitepin]
---

# Fork releases

**Where:** `.github/workflows/fork-release.yml` (fork-only), with
`.github/workflows/release.yml` scoped to `NeosiaNexus`.

## Why not npm
The `@siteping` npm scope belongs to upstream, so the fork can't publish there.
Fork builds are `npm pack` tarballs attached to GitHub releases. Consumers
install them by URL, and their lockfile pins the `integrity`.
`release.yml` (release-please and the npm fan-out) runs only in upstream; in
the fork, only its CI job runs.

## Cutting a release
1. Pick the commit. On `main` the base is the version that
   `packages/<component>/package.json` declares (release-please's manifest,
   untouched by the fork). For an older contract, use a backport branch cut
   from the upstream tag (`fork/widget-0.10.x` from `widget-v0.10.10`).
2. Tag `<component>-v<base>-fork.<N>`. `<base>` must equal the declared
   version, or the workflow fails. `N` starts at 1.
   ```sh
   git tag widget-v0.11.0-fork.1 <sha> && git push origin widget-v0.11.0-fork.1
   ```
3. The workflow builds and tests that package, stamps `<base>-fork.<N>` (never
   committed), packs it, refuses a `workspace:` specifier, and publishes the
   release with `siteping-<component>-<version>.tgz` and its integrity in the
   notes.
4. A tag whose commit predates the workflow file: run it by hand
   (`gh workflow run fork-release.yml -f tag=<tag>`).

## Rules
- **Immutable.** The repository has immutable releases enabled, and the
  workflow refuses an existing release and never clobbers. A fix ships as
  `fork.<N+1>`. Re-uploading would break every consumer's integrity pin.
- `-fork.N` is a semver pre-release, so it never equals an upstream npm
  version. It also sorts *below* `<base>`, so never use a range (`^`) on it;
  pin the exact URL.
- The draft → upload → publish order is required. Immutable releases reject
  uploads after publish.

## Consuming
```json
"@siteping/widget": "https://github.com/davidvasandani/siteping/releases/download/widget-v0.10.10-fork.1/siteping-widget-0.10.10-fork.1.tgz"
```
Then run `npm install` to refresh the lockfile, and check that its
`integrity` equals the release notes. Nix `importNpmLock` fetches the
`resolved` URL against that integrity, so no extra hash is needed.
