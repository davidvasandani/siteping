---
title: Widget scrolling on host pages (app shells, inner scrollers)
tags: [widget, markers, scrolling, host-layout]
tasks: [vk/57e4-fix-go-to-annota]
---

# Widget scrolling on host pages

**Where:** `packages/widget/src/dom/scroll-into-view.ts`, used by
`MarkerManager.focusFeedback` (`markers.ts`) — which backs the panel's
"Go to annotation" (`revealPin`), the `deepLink` option and `instance.focusFeedback`.

## Facts worth knowing
- The marker layer `#siteping-markers` is `position:absolute` on `<body>`
  with document coordinates. `marker.scrollIntoView()` therefore only ever
  scrolls the **document** — useless when the host scrolls content inside an
  element (`html, body { overflow: hidden }` + `<main class="overflow-y-auto">`).
- The marker layer's containing block is the initial containing block, so it
  is **not clipped** by `body { overflow: hidden }`: it extends the viewport's
  scrollable overflow, and a viewport with `overflow: hidden` stays
  *programmatically* scrollable. Any `window.scroll*` there slides the whole
  app shell (the original bug: window moved 1729px, content stayed put).
  Guard window scrolls with "is the viewport clipped?" (`viewportScrolls`).
- Markers/highlights already track inner scrolls: the scroll listener is
  `capture: true` on `window`, so inner-element scroll events reach it.
- Scroll ranges are not always `[0, max]`: RTL `scrollLeft` and
  `flex-direction: column-reverse` `scrollTop` are ≤ 0. Don't hand-clamp —
  request the delta with `behavior: "instant"`, read back the real change,
  restore with `scrollTo({ behavior: "instant" })`, then animate that amount.
- Ancestor walks must use the flat tree: `assignedSlot` before
  `parentElement`, then `ShadowRoot.host`. Stop at `position: fixed`.
- Known limitations: transform-scaled scroll containers; fixed elements whose
  containing block is a transformed ancestor.

## Testing
- jsdom has no layout: stub `getBoundingClientRect`, `client*`/`scroll*`, and
  make `scrollBy` move offsets on `behavior: "instant"`
  (`packages/widget/__tests__/dom/scroll-into-view.test.ts`).
- Real-browser repro: Playwright + `packages/widget/dist/index.global.js`
  (`SitePing.initSiteping`), route `/api/siteping` to a fixture; feedback `url`
  must be the **pathname** (scope URL), not the full URL, or no marker renders.
  On NixOS the Playwright-downloaded Chromium lacks libs — use
  `nix build nixpkgs#chromium` and `executablePath`.
- The widget IIFE budget (`packages/widget/.size-limit.json`) is tight, and CI
  measures ~0.6 kB gzipped **more** than a local NixOS build of the same commit
  — a local pass with < 1 kB headroom is not proof. Features that genuinely
  need bytes raise the budget in the same PR, stating the cost (this fix:
  ~0.6 kB, 137 → 138 kB).
