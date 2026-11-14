import { describe, expect, it } from "vitest";
import { formatRecordingTime, recordingFileName } from "../src/recording/model.js";

describe("recording model", () => {
  it("formats elapsed and remaining times without showing negative values", () => {
    expect(formatRecordingTime(0)).toBe("0:00");
    expect(formatRecordingTime(60_001)).toBe("1:01");
    expect(formatRecordingTime(-500)).toBe("0:00");
  });

  it("builds a safe WebM download name", () => {
    expect(recordingFileName("fb/one two", "2026-11-14T17:20:30.123Z")).toBe(
      "siteping-fb-one-two-2026-11-14T17-20-30Z.webm",
    );
  });
});
