# 0.10.10 backport validation

Task: vk/16ab-siteping-didn-t. Backport of the implementation reviewed in SitePing PR #9.

Build and typecheck passed. Lint passed after removing a temporary local browser
config. The full suite passed 2,272 tests; one older same-page fixture used an
absolute URL instead of its configured pathname scope. Correcting that fixture
made all 179 panel tests pass (2,273 tests covered overall). No production behavior
was changed to accommodate the fixture.

Chromium tested the built IIFE: Sandbox → talent with a custom deep-link parameter,
then destination annotation scroll. Size gate passed (ESM 31.18/54 kB,
IIFE 130.24/135 kB gzip). Independent `codex review --uncommitted` reported no
actionable defects. Server contract and package dependencies remain unchanged.
