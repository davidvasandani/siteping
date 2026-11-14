export interface JpegInfo {
  width: number;
  height: number;
  /** 1 for greyscale, 3 for colour: the two a PDF embeds without further description. */
  components: 1 | 3;
}

/**
 * Read a JPEG's size and colour model from its frame header. A PDF embeds
 * JPEG data as it is (`DCTDecode`) and only needs these to describe it.
 * `null` for anything that is not a JPEG the report can embed directly:
 * truncated data, another format, or a four-channel (CMYK) file, whose
 * channels a reader would have to be told how to invert.
 */
export function parseJpeg(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] as number;
    // Fill bytes before a marker, and markers that stand alone.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    // Start of frame, in any of its codings; C4, C8 and CC are other segments.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (offset + 10 > bytes.length) return null;
      const height = ((bytes[offset + 5] as number) << 8) | (bytes[offset + 6] as number);
      const width = ((bytes[offset + 7] as number) << 8) | (bytes[offset + 8] as number);
      const components = bytes[offset + 9];
      if (width === 0 || height === 0 || (components !== 1 && components !== 3)) return null;
      return { width, height, components };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** The bytes of a base64 `data:` URL, and its media type. `null` when it is not one. */
export function decodeDataUrl(dataUrl: string): { mediaType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2] as string);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mediaType: (match[1] as string).toLowerCase(), bytes };
  } catch {
    return null;
  }
}
