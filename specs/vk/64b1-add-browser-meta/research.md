# Research: browser metadata formatting

## R1: Derive from the existing record

**Decision:** parse `FeedbackRecord.userAgent` and `viewport` at display time.

**Why:** every existing and future annotation already has these fields. This
immediately enriches old records, avoids migration/write races, and adds no new
collection or permission.

**Rejected:** store parsed labels during creation. Labels would become frozen
to an old parser and would require changing core/widget behavior or rewriting
existing records.

## R2: A small ordered parser, not a dependency

**Decision:** use a narrow ordered table for major browser/platform families.

**Why:** only human-readable triage labels are needed. Full UA parsers add
bundle size, a new supply-chain surface, and device-model granularity the
privacy requirement explicitly excludes.

**Ordering:** Edge (`Edg`, `EdgiOS`, `EdgA`), Opera (`OPR`, `OPiOS`), Samsung
Internet, Firefox (`Firefox`, `FxiOS`), Chrome (`Chrome`, `CriOS`), then Safari
(`Version` plus Safari compatibility token). ChromeOS precedes Linux; iPadOS
desktop-mode evidence (`Macintosh` plus `Mobile`) precedes macOS.

## R3: Export concise labels

**Decision:** export browser major, OS family, device class, and normalized
viewport; never the raw UA.

**Why:** those four labels are enough for common visual reproduction while the
raw UA may contain patch/build/device detail and is noisy in Slack/PDF.

## R4: Unknown is a result

**Decision:** return `Unknown browser`, `Unknown OS`, `Unknown device`, or
`Unknown viewport` rather than guessing or omitting the entire context.

**Why:** stored values are untrusted and UA formats evolve. Explicit unknowns
make missing evidence visible without breaking annotation review.
