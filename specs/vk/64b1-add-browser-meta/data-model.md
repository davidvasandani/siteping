# Data model: derived extension environment metadata

No persisted data changes. The existing core record remains authoritative:

```ts
interface FeedbackRecord {
  userAgent: string;
  viewport: string;
  // existing fields omitted
}
```

The extension derives this ephemeral view model:

```ts
interface EnvironmentMetadata {
  browser: string;  // e.g. "Edge 141" or "Unknown browser"
  os: string;       // e.g. "Windows" or "Unknown OS"
  device: "Desktop" | "Tablet" | "Mobile" | "Unknown device";
  viewport: string; // e.g. "1280×720" or "Unknown viewport"
}
```

`ReportItem.environment` holds this value so PDF, Slack, and clipboard renderers
consume one normalized contract. Review cards derive the identical value from
their source record. All fields are display text, never identifiers or keys.
