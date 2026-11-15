export interface EnvironmentMetadata {
  browser: string;
  os: string;
  device: "Desktop" | "Tablet" | "Mobile" | "Unknown device";
  viewport: string;
}

interface BrowserPattern {
  name: string;
  pattern: RegExp;
}

// Specific compatibility tokens must precede Chrome and Safari. Each pattern
// captures only the version segment whose first component is meaningful here.
const BROWSERS: BrowserPattern[] = [
  { name: "Edge", pattern: /(?:EdgA|EdgiOS|Edg)\/(\d+)/i },
  { name: "Opera", pattern: /(?:OPiOS|OPR)\/(\d+)/i },
  { name: "Samsung Internet", pattern: /SamsungBrowser\/(\d+)/i },
  { name: "Firefox", pattern: /(?:FxiOS|Firefox)\/(\d+)/i },
  { name: "Chrome", pattern: /(?:CriOS|Chrome)\/(\d+)/i },
  { name: "Safari", pattern: /Version\/(\d+)[^\n]*Safari\//i },
];

function browserLabel(userAgent: string): string {
  for (const { name, pattern } of BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match) return match[1] ? `${name} ${match[1]}` : name;
  }
  return "Unknown browser";
}

function platform(userAgent: string): Pick<EnvironmentMetadata, "os" | "device"> {
  // iPadOS can request a desktop UA: it says Macintosh but retains Mobile.
  if (/iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile\//i.test(userAgent))) {
    return { os: "iOS", device: "Tablet" };
  }
  if (/(?:iPhone|iPod)/i.test(userAgent)) return { os: "iOS", device: "Mobile" };
  if (/Android/i.test(userAgent)) {
    return { os: "Android", device: /Mobile/i.test(userAgent) ? "Mobile" : "Tablet" };
  }
  if (/CrOS/i.test(userAgent)) return { os: "ChromeOS", device: "Desktop" };
  if (/Windows/i.test(userAgent)) return { os: "Windows", device: "Desktop" };
  if (/(?:Macintosh|Mac OS X)/i.test(userAgent)) return { os: "macOS", device: "Desktop" };
  if (/Linux/i.test(userAgent)) return { os: "Linux", device: "Desktop" };
  return { os: "Unknown OS", device: "Unknown device" };
}

function viewportLabel(viewport: string): string {
  const match = /^\s*([1-9]\d*)\s*[x×]\s*([1-9]\d*)\s*$/i.exec(viewport);
  return match ? `${match[1]}×${match[2]}` : "Unknown viewport";
}

/** Human-readable, privacy-conscious context derived from a stored record. */
export function describeEnvironment(userAgent: string, viewport: string): EnvironmentMetadata {
  return {
    browser: browserLabel(userAgent),
    ...platform(userAgent),
    viewport: viewportLabel(viewport),
  };
}

export function formatEnvironment(environment: EnvironmentMetadata): string {
  return [environment.browser, environment.os, environment.device, environment.viewport].join(" · ");
}
