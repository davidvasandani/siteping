<!--
SpecKit project constitution.
Edit this to capture the non-negotiable principles every feature must honor.
The Specify / Plan / Analyze stages read this file and check work against it.
-->

# Project Constitution

## Core Principles

### I. Clarity over cleverness
Code and specs are written to be read. Prefer the obvious solution; justify any
non-obvious one in the spec.

### II. Test the contract
Every feature defines how we will know it works (acceptance criteria) before it
is implemented. No feature is "done" without a checkable validation.

### III. Small, reversible steps
Ship the smallest change that delivers value. Avoid speculative generality.

### IV. One MCP contract for all agents
Shared MCP server configuration has one canonical definition and is adapted to
each agent's native config format at the boundary. Agent-specific exceptions must
be documented in the spec, preserve the shared behavior, and include validation
for each affected agent.

### V. Settings host scope is a data boundary
Host-specific Settings features must bind reads, writes, cache keys, and draft
state to the Settings-selected host. Specs must identify whether a Settings
section is local-only, remote-only, or host-scoped, and host-scoped work must
validate that switching hosts cannot show stale data or mutate the wrong
machine.

### VI. Responsive layout state owns layout chrome
Controls that are present only for a desktop, mobile, local, remote, or other
layout mode must use that mode's canonical state as the visibility authority.
Secondary environment or device signals may be retained as defense in depth, but
they must not contradict the selected layout. Specs that alter layout-specific
chrome must identify the owning layout signal and validate mismatches between
layout state and environment detection.

### VII. Bundled executable entries install what they advertise
Bundled catalog entries that cause a user's machine to execute third-party or
forked code must make provenance explicit and testable. The executable source
must match the advertised metadata, use an immutable reviewed version instead of
a moving branch or `latest` when a fork or non-obvious build is required, and
record the verification or audit control that keeps the pin honest. Specs that
change such entries must update the catalog, source constants, dependency
automation, and user documentation together, or record a deliberate exception
with its threat, detection path, and reopening trigger.

### VIII. Fork additions stay mergeable
This repository is a fork that merges upstream `main`. A feature the fork adds
on top of upstream lives in an additive workspace and does not edit the source
of a published `packages/*` package. A spec that must edit one names the files,
the reason no additive seam works, and how the next upstream merge is kept
clean. A build-time seam into a package's internals fails the build when it
stops matching.

### IX. Local-first extension data
Content a reviewer creates in the browser extension (text, page URLs,
screenshots, identity) stays on their machine. It leaves only through an export
the reviewer triggers, to a destination the reviewer configured, and the UI
states what is sent. The extension requests no host access at install: page
access comes from the reviewer switching it on for a tab, and any further host
is an optional permission requested at the action that needs it. Specs that add
a network call or a permission list both and validate the shipped manifest.

### X. One writer per shared storage
A store reachable from several browser contexts (tabs, popup, extension pages,
background) has exactly one writing context. Other contexts send it their
writes; they may read directly. Specs name the writer and validate that
concurrent writes from two contexts both survive.

## Constraints
- Follow the existing architecture and conventions of the repository.
- Do not introduce new top-level dependencies without recording the reason in
  the plan's research notes.

## Governance
This constitution supersedes ad-hoc preferences. When a spec or plan conflicts
with it, the constitution wins or the conflict is recorded as an open question.

**Version**: 0.7.0

## Widget navigation amendment (2026-10-16)
Annotation anchors and scroll offsets belong to the recorded page. Cross-page actions
must navigate safely before resolving them. Preserve configured page identity,
existing scroll-container handling, and consumer wire compatibility. Fork consumer
updates use immutable release URLs and lockfile integrity.

## Extension recording amendment (2026-11-14)
Screen recordings are local-first extension data under Principle IX. Large binary
media is stored outside JSON extension messaging, with one writing context under
Principle X and extension-side ownership keyed to the feedback id under Principle
VIII. Recording requires an explicit reviewer action, never adds audio implicitly,
and must have a bounded lifetime. Feedback deletion cascades to associated media;
quota or media failures must preserve feedback text and be visible to the reviewer.
