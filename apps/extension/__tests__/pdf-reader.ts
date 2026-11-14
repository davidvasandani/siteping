import { getDocument, OPS, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ReadPage {
  /** Text items in drawing order, with runs of whitespace collapsed. */
  text: string[];
  /** Number of images painted. */
  images: number;
  /** Addresses of the page's link annotations. */
  links: string[];
}

export interface ReadPdf {
  title: string | undefined;
  pages: ReadPage[];
}

/**
 * Read a PDF back with pdf.js, a reader that shares no code with the writer
 * under test: a file it opens, with the text, images and links where they
 * were put, is evidence the writer emits PDF and not just something its own
 * author would accept.
 */
export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  // pdf.js takes ownership of the buffer it is given.
  const task = getDocument({ data: bytes.slice(), verbosity: VerbosityLevel.ERRORS });
  const doc = await task.promise;
  const metadata = await doc.getMetadata();
  const pages: ReadPage[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const operators = await page.getOperatorList();
    const annotations = await page.getAnnotations();
    pages.push({
      // pdf.js reports runs of spaces as one, and the gaps between items as items of their own.
      text: content.items.flatMap((item) => ("str" in item && item.str.trim() ? [item.str.replace(/\s+/g, " ")] : [])),
      images: operators.fnArray.filter((fn) => fn === OPS.paintImageXObject).length,
      links: annotations.flatMap((annotation) => (annotation.url ? [annotation.url as string] : [])),
    });
  }
  await task.destroy();
  return { title: (metadata.info as { Title?: string }).Title, pages };
}
