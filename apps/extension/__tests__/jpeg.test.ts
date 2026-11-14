import { describe, expect, it } from "vitest";
import { decodeDataUrl, parseJpeg } from "../src/pdf/jpeg.js";
import { TINY_JPEG_BASE64, TINY_JPEG_DATA_URL } from "./fixtures.js";

/** A JPEG header: start of image, an application segment, then a frame header. */
function jpeg(
  frameMarker: number,
  width: number,
  height: number,
  components: number,
  prefix: number[] = [],
): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46, // APP0, 2 bytes of payload
    ...prefix,
    0xff,
    frameMarker,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    components,
    0x01,
    0x11,
    0x00,
  ]);
}

describe("parseJpeg", () => {
  it("reads a baseline frame", () => {
    expect(parseJpeg(jpeg(0xc0, 880, 440, 3))).toEqual({ width: 880, height: 440, components: 3 });
  });

  it("reads a progressive frame and a greyscale image", () => {
    expect(parseJpeg(jpeg(0xc2, 1200, 600, 3))).toEqual({ width: 1200, height: 600, components: 3 });
    expect(parseJpeg(jpeg(0xc0, 10, 20, 1))).toEqual({ width: 10, height: 20, components: 1 });
  });

  it("skips Huffman tables and fill bytes on the way to the frame", () => {
    const table = [0xff, 0xc4, 0x00, 0x03, 0x00, 0xff, 0xff];
    expect(parseJpeg(jpeg(0xc0, 64, 32, 3, table))).toEqual({ width: 64, height: 32, components: 3 });
  });

  it("reads a real file", () => {
    expect(parseJpeg(decodeDataUrl(TINY_JPEG_DATA_URL)?.bytes as Uint8Array)).toEqual({
      width: 1,
      height: 1,
      components: 1,
    });
  });

  it.each([
    ["an empty buffer", new Uint8Array()],
    ["a PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["a CMYK image", jpeg(0xc0, 10, 10, 4)],
    ["a zero-sized image", jpeg(0xc0, 0, 10, 3)],
    ["a file cut before its frame", jpeg(0xc0, 10, 10, 3).slice(0, 12)],
    ["garbage after the start marker", new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03])],
  ])("refuses %s", (_label, bytes) => {
    expect(parseJpeg(bytes)).toBeNull();
  });
});

describe("decodeDataUrl", () => {
  it("returns the bytes and the media type", () => {
    const decoded = decodeDataUrl(`data:IMAGE/JPEG;base64,${TINY_JPEG_BASE64}`);
    expect(decoded?.mediaType).toBe("image/jpeg");
    expect([...(decoded?.bytes.slice(0, 2) ?? [])]).toEqual([0xff, 0xd8]);
  });

  it("refuses anything that is not a base64 data URL", () => {
    expect(decodeDataUrl("https://example.com/a.jpg")).toBeNull();
    expect(decodeDataUrl("data:text/plain,hello")).toBeNull();
    expect(decodeDataUrl("data:image/jpeg;base64,***")).toBeNull();
  });
});
