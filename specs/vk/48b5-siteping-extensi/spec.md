# Feature Specification: SitePing extension screen recording

**Feature dir**: `specs/vk/48b5-siteping-extensi/`
**Status**: Draft

## Summary

Add local-only screen recording to the SitePing Chrome extension so a reviewer
can attach a short demonstration of motion or a multi-step failure to an
ordinary feedback item, then play, download, delete, and represent that
recording in PDF and Slack exports without uploading the video.

## User Stories

- As a reviewer, I want to record the current tab after an explicit click so I
  can show a broken animation or multi-step flow.
- As a reviewer, I want the recording attached to a normal feedback item so it
  keeps the same page, message, type, status, and deletion lifecycle.
- As a reviewer, I want a clear on-page recording indicator and timer so I
  never wonder whether capture is active.
- As a reviewer, I want to play, download, or remove a recording from the
  review page while keeping all data on my machine.
- As a recipient of an export, I want to know a recording exists and see a
  representative still even though the export cannot contain playable video.

## Functional Requirements

- FR-1: A recording belongs to exactly one feedback item, and a feedback has at
  most one current recording.
- FR-2: Recording starts only after an explicit reviewer click in the toolbar
  popup or the recording keyboard shortcut and only for the current tab.
- FR-3: Before starting, the reviewer selects an existing feedback on the
  current page as the recording's owner. The extension never guesses among
  multiple feedback items.
- FR-4: The extension records video only: no microphone, tab audio, system
  audio, webcam, or other tabs/windows/screens.
- FR-5: While recording, the page visibly shows a red recording state, elapsed
  time, remaining time, and a Stop control. The popup shows the same state.
- FR-6: The recording includes the page as the reviewer saw it, including
  SitePing's launcher, markers, panels, and recording indicator.
- FR-7: A reviewer can stop manually. Recording also stops automatically at
  two minutes and clearly says that the limit ended it.
- FR-8: Closing the captured tab ends and saves a valid non-empty recording;
  same-tab navigation continues capture; loss of the capture stream ends in a
  saved recording or a visible failure.
- FR-9: Closing the popup does not stop recording. A background worker restart
  must recover the active state or report that recording ended before saving;
  it must never leave silent loss or an untracked capture.
- FR-10: Recordings persist across browser restarts and remain playable.
- FR-11: The review page displays a poster frame, duration, native playback,
  Download video, and Delete recording for each attached recording.
- FR-12: Download produces a video file that a standard player supporting the
  browser's WebM output can open.
- FR-13: Delete recording removes only the video. Deleting its feedback from
  the review page or page widget, and Delete all for a site, removes associated
  recording data as well.
- FR-14: If storage/quota or media finalization fails, feedback text and its
  screenshot remain saved and the reviewer is told the recording was not.
- FR-15: PDF export shows a still frame, duration, and a note that the selected
  feedback has a local screen recording. It does not embed playable video.
- FR-16: Slack and clipboard exports say that a selected feedback has a screen
  recording kept on the reviewer's machine. They do not send or link video.
- FR-17: Feedback without recording retains existing review and export
  behavior.
- FR-18: Nothing recorded leaves the machine and no recording feature adds a
  network request.
- FR-19: Chrome 116+ supports recording. Safari shows an explicit unavailable
  state and continues to support the rest of the extension.
- FR-20: The Chrome manifest adds only the recording permissions named in the
  technical plan; Safari omits unsupported Chrome-only permissions. Exact
  permissions remain build-tested and install-time site access remains absent.
- FR-21: Recording and review playback do not make the page or review page
  unresponsive under the two-minute limit.
- FR-22: Screenshot capture remains unchanged and independent from recording.

## Out of Scope

- Microphone, tab/system audio, webcam, drawing on video, trimming, editing,
  transcription, narration, or capture outside the current tab.
- Standalone recordings without feedback ownership or multiple recordings per
  feedback.
- Upload, sync, cloud storage, Slack file upload, or a SitePing server.
- Safari recording until it can be implemented and run in Safari.
- Changes to any published `packages/*` source.

## Acceptance Criteria

- [ ] In Chromium, a reviewer enables SitePing, selects existing feedback,
      starts recording, interacts with an animated/multi-step fixture, and
      stops; the review card plays the captured behavior.
- [ ] The on-page indicator and popup both show recording state, elapsed and
      remaining time, and Stop; the recording includes that on-page state.
- [ ] The recording survives closing and reopening the browser profile.
- [ ] Downloaded video opens in a standard WebM-capable player.
- [ ] Delete recording leaves feedback intact; deleting feedback from both UI
      routes and deleting all site feedback removes video storage.
- [ ] PDF contains a still, duration, and recording note; Slack/clipboard
      contain the recording note; unchanged items export correctly.
- [ ] Recording auto-stops at the configured two-minute production limit and
      reports that reason.
- [ ] Quota failure preserves feedback and visibly reports no saved video.
- [ ] Tab close, same-tab navigation, capture loss, and worker restart each
      match their defined terminal/recovery behavior.
- [ ] Chrome and Safari manifests match the exact planned permission lists;
      Safari conversion/build remains green and its UI says unsupported.
- [ ] Chromium e2e records without a person accepting a picker.
- [ ] `bun run verify`, `bun run check:consistency`, and `bun run knip` pass,
      and `git diff --stat main -- packages/` is empty.
- [ ] README accurately separates verified Chrome behavior, Safari compile
      verification, and unsupported Safari recording.

## Open Questions

- None. The task's recommended choices are adopted and browser behavior is
  resolved in `technical-spec.md` and the clarify stage.

