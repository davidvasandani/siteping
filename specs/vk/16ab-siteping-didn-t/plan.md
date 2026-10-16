# Technical plan (/speckit.plan)

TypeScript widget; no new dependencies or data migrations.

- `packages/widget/src/annotation-navigation.ts`: construct a same-origin HTTP(S)
  destination with the configured deep-link parameter; reject credentials and
  invalid URLs. Page equality uses `getScope().url` exactly as markers do.
- `packages/widget/src/launcher.ts`: pass normalized deep-link parameter to Panel.
- `packages/widget/src/panel.ts`: expose cross-page action only with a safe target;
  navigate and return before any pin/scroll operation. Same-page remains unchanged.
- `packages/widget/__tests__/annotation-navigation.test.ts`: URL safety/query/hash tests.
- Panel interaction regression coverage using the repository's existing test pattern.
- Backport these changes to `fork/widget-0.10.x` for Teemay's compatible release;
  update `teemay/web/package.json`, `package-lock.json`, and `PROVENANCE.md`.

Constitution: page boundary enforced, reversible focused changes, tests of behavior,
no extra dependency, immutable provenance. MCP/settings/layout rules unaffected.

Risks: redirects/auth may prevent destination access; host remains responsible.
Initial deep-link focus only sees fetched feedback; preserve current behavior and
verify a representative destination. Teemay's recorded URL is a pathname.
