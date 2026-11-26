import { layoutText, type TextPiece } from "./layout";

/** CVs are rarely over a few hundred KB; anything this big is probably the wrong file. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Format = "docx" | "pdf" | "txt";

const FORMAT_BY_EXTENSION: Record<string, Format> = { docx: "docx", pdf: "pdf", txt: "txt", md: "txt" };
const FORMAT_BY_MIME: Record<string, Format> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

function detectFormat(file: File): Format {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "doc") {
    throw new Error("Old Word .doc files aren't supported. Open it in Word and save it as .docx.");
  }
  const format = FORMAT_BY_EXTENSION[extension] ?? FORMAT_BY_MIME[file.type];
  if (!format) throw new Error(`Unsupported file "${file.name}". Use a .docx, .pdf or .txt file.`);
  return format;
}

async function readDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return value;
}

async function readPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  }

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const pieces: TextPiece[] = content.items.flatMap((item) =>
        "str" in item
          ? [{
              str: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: Math.abs(item.transform[3]) || item.height,
            }]
          : [],
      );
      pages.push(layoutText(pieces));
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    await task.destroy();
  }
}

/**
 * Reads a CV file (.docx, .pdf or .txt) into plain text, entirely in the browser.
 * Throws an Error with a message suitable for showing to the user.
 */
export async function extractCvText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too large for a CV (over 10 MB).");
  const format = detectFormat(file);
  if (format === "txt") return (await file.text()).trim();

  let text: string;
  try {
    const data = await file.arrayBuffer();
    text = format === "docx" ? await readDocx(data) : await readPdf(data);
  } catch (cause) {
    throw new Error(`Could not read "${file.name}". The file may be damaged or password-protected.`, { cause });
  }

  text = text.trim();
  if (!text) {
    throw new Error(
      format === "pdf"
        ? "This PDF has no text in it. It's probably a scanned image. Export the CV from Word or Google Docs instead."
        : "This document appears to be empty.",
    );
  }
  return text;
}
