---
title: Generating a PDF in the browser without a library
tags: [pdf, export, fonts, unicode, testing]
tasks: [vk/e5c0-siteping-chrome]
---

# PDF without a library

**Where:** `apps/extension/src/pdf/` (`writer.ts`, `metrics.ts`,
`winansi.ts`, `jpeg.ts`, `report.ts`, `raster.ts`).

## Why not a library, or print
`window.print()` needs the user to choose a destination and adds browser
headers. `pdf-lib` / `jsPDF` add hundreds of kilobytes and still cannot write
CJK without shipped fonts. The report needs shapes, two fonts, JPEG images
and links: a few hundred lines of PDF 1.4.

## Facts
- The reader's built-in Helvetica needs no embedding, but the file must lay
  text out itself. Advance widths come from Adobe's Core 14 AFM files, by
  glyph name, for WinAnsi codes 32 to 255 (`metrics.ts`). Ascender 718,
  descender -207, cap height 718.
- WinAnsi is Windows-1252: Latin-1 plus 27 code points in 0x80 to 0x9F. Write
  text as hex strings (`<…> Tj`) and nothing needs escaping.
- A JPEG is embedded byte for byte with `/Filter /DCTDecode`; only width,
  height and component count are read from its frame header (any SOF marker
  except C4, C8, CC). Stored screenshots are JPEG, so nothing is re-encoded.
  Four-channel JPEGs need re-encoding first.
- `CompressionStream("deflate")` emits the zlib stream `FlateDecode` expects.
  It exists in Chrome, Safari 16.4 and Node 18+, so the same code runs in
  tests.
- Opacity is an `ExtGState` (`/ca`, `/CA`), which needs PDF 1.4.
- Cross-reference entries are exactly 20 bytes each (`"%010d %05d n \n"`).
- Metadata strings outside ASCII are UTF-16BE with a byte-order mark.

## Text the standard fonts cannot write
A paragraph that is entirely WinAnsi stays real text. Any other paragraph is
drawn on a canvas with the system fonts at three times the print size and
embedded as RGB pixels, one image per line so a long card can still break
across pages. Without a rasteriser (unit tests) such characters become `?`.
Normalise first (narrow spaces, non-breaking hyphen, soft hyphen, zero-width
space) so a pasted typographic character does not push a Latin paragraph
into pixels, but keep the zero-width joiner and non-joiner: they make one
emoji of several and shape Persian and Arabic.

## Layout
Cards are lists of rows. A card goes on the current page if it fits, on a new
page if it fits a whole page, and is split between rows only when taller than
a page. A screenshot is never drawn larger than it was on screen (0.75pt per
CSS pixel).

## Testing
- Parse the output with `pdfjs-dist` (`__tests__/pdf-reader.ts`): a reader
  that shares no code with the writer. In pdf.js 6 the loading task has
  `destroy()`, the document does not; text extraction collapses runs of
  spaces and reports gaps as separate items.
- Look at it: `mutool draw -r 110 -o page-%d.png file.pdf` (mupdf is in the
  nix store on the build host), then read the PNG.
- The build host has only DejaVu Sans: Cyrillic renders, CJK and emoji show
  as boxes there. That is the machine, not the code.
