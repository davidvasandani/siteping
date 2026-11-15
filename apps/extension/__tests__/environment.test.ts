import { describe, expect, it } from "vitest";
import { describeEnvironment, formatEnvironment } from "../src/shared/environment.js";

const desktop = (token: string, platform = "Windows NT 10.0; Win64; x64") =>
  `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) ${token} Safari/537.36`;

describe("describeEnvironment", () => {
  it.each([
    ["Edge 141", desktop("Chrome/141.0.0.0 Edg/141.0.0.0")],
    ["Opera 122", desktop("Chrome/141.0.0.0 OPR/122.0.0.0")],
    ["Samsung Internet 29", desktop("Chrome/141.0.0.0 Mobile SamsungBrowser/29.0", "Linux; Android 16")],
    ["Firefox 145", "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"],
    ["Chrome 141", desktop("Chrome/141.0.0.0")],
    ["Safari 26", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.1 Safari/605.1.15"],
    ["Edge 141", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) EdgiOS/141.0 Mobile/15E148 Safari/604.1"],
    ["Opera 7", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) OPiOS/7.0 Mobile/15E148 Safari/9537.53"],
    ["Firefox 145", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/145.0 Mobile/15E148 Safari/605.1.15"],
    ["Chrome 141", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/141.0 Mobile/15E148 Safari/604.1"],
  ])("identifies %s before compatible fallback tokens", (expected, userAgent) => {
    expect(describeEnvironment(userAgent, "1280x720").browser).toBe(expected);
  });

  it.each([
    ["Windows", "Desktop", desktop("Chrome/141.0.0.0")],
    ["ChromeOS", "Desktop", desktop("Chrome/141.0.0.0", "X11; CrOS x86_64 16000.0.0")],
    ["macOS", "Desktop", desktop("Chrome/141.0.0.0", "Macintosh; Intel Mac OS X 10_15_7")],
    ["Linux", "Desktop", desktop("Chrome/141.0.0.0", "X11; Linux x86_64")],
    ["iOS", "Mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1"],
    ["iOS", "Tablet", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1"],
    ["iOS", "Tablet", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Mobile/15E148 Safari/604.1"],
    ["Android", "Mobile", desktop("Chrome/141.0.0.0 Mobile", "Linux; Android 16; Pixel 10")],
    ["Android", "Tablet", desktop("Chrome/141.0.0.0", "Linux; Android 16; Pixel Tablet")],
  ])("classifies %s as %s", (os, device, userAgent) => {
    expect(describeEnvironment(userAgent, "1280x720")).toMatchObject({ os, device });
  });

  it.each([
    ["1280x720", "1280×720"],
    [" 390 X 844 ", "390×844"],
    ["1024×768", "1024×768"],
    ["0x720", "Unknown viewport"],
    ["1280.5x720", "Unknown viewport"],
    ["wide", "Unknown viewport"],
  ])("normalizes viewport %j", (input, expected) => {
    expect(describeEnvironment("", input).viewport).toBe(expected);
  });

  it("returns honest complete fallbacks for unfamiliar input", () => {
    const metadata = describeEnvironment("test harness", "invalid");
    expect(metadata).toEqual({
      browser: "Unknown browser",
      os: "Unknown OS",
      device: "Unknown device",
      viewport: "Unknown viewport",
    });
    expect(formatEnvironment(metadata)).toBe("Unknown browser · Unknown OS · Unknown device · Unknown viewport");
  });
});
