# Contract: extension environment metadata

`describeEnvironment(userAgent, viewport)` is pure and total: for any strings it
returns all four non-empty labels and does not throw.

## Browser label precedence

1. Edge desktop/Android/iOS
2. Opera desktop/iOS
3. Samsung Internet
4. Firefox desktop/Android/iOS
5. Chrome desktop/Android/iOS
6. Safari with an explicit `Version` token
7. Unknown browser

Known labels include only the major version, for example `Chrome 141`. If a
family token exists without a numeric version, return the family alone.

## OS and device

OS labels: `Windows`, `ChromeOS`, `macOS`, `iOS`, `Android`, `Linux`, or
`Unknown OS`. iPad desktop-mode (`Macintosh` and `Mobile`) is iOS/Tablet.
Android without `Mobile` is Tablet; Android with `Mobile` is Mobile. iPhone and
iPod are Mobile. iPad is Tablet. Desktop OS evidence is Desktop. Otherwise the
device is unknown.

## Viewport

A positive-integer pair separated by `x`, `X`, or `×`, with optional surrounding
whitespace, becomes `width×height`. Zero, negative, fractional, extra-token, or
non-numeric input becomes `Unknown viewport`.

## Rendering

Every annotation card and export displays the labels in this order:

`Browser · OS · Device · Viewport`

The raw user-agent is never rendered or exported.
