---
title: Annotation navigation must respect page identity
tags: [widget, annotations, navigation, deep-link]
tasks: [vk/16ab-siteping-didn-t]
---

# Annotation navigation and page identity

A shared selector such as `#main` can resolve successfully on the wrong page.
Before scrolling or resolving anchors, the panel compares feedback `url` with
`getScope().url`, the same identity used by marker filtering.

With `deepLink` enabled, a cross-page “Go to annotation” loads the recorded page
and adds the feedback ID under the configured query parameter. The existing
initial-load deep-link handler focuses it after fetching destination markers.
`annotationDestination` rejects invalid URLs, credentials, and destinations outside
the current HTTP(S) origin, and preserves destination query fields and fragments.
Without deep links the cross-page action is hidden. The callback also checks the
page boundary, guarding stale actions after host navigation.

`scopeAnnotationsByUrl: false` is the explicit legacy opt-out: project-wide markers
and reveal behavior stay unchanged. Teemay uses the default isolation and pathname
page scope. No identity or sandbox context is switched by annotation navigation;
the destination remains subject to host authorization.

Validation: `e2e/annotation-navigation.spec.ts` exercises two documents sharing
`#main`, actual navigation, and destination scroll using the shipped IIFE.
Unit tests cover URL safety and the absence of wrong-page scroll/highlight calls.
Teemay requires a backport on `fork/widget-0.10.x`, not a 0.11 server-contract upgrade;
see [fork releases](fork-releases.md).
