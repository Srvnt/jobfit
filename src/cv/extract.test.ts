import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { segment } from "../core/segment";
import { extractCvText, MAX_FILE_BYTES } from "./extract";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function makeDocx(): Promise<File> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Built ETL pipelines with Airflow and dbt", bullet: { level: 0 } }),
          new Paragraph({ text: "Led a team of four engineers", bullet: { level: 0 } }),
          new Paragraph({ text: "Languages", heading: HeadingLevel.HEADING_1 }),
          new Paragraph("Finnish (native) and English (fluent)"),
        ],
      },
    ],
  });
  return new File([await Packer.toBlob(doc)], "cv.docx", { type: DOCX_MIME });
}

async function makePdf(lines: string[] = []): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 780;
  for (const line of lines) {
    if (line) page.drawText(line, { x: 50, y, size: 12, font });
    y -= line ? 16 : 32; // an empty entry leaves a larger gap, like a new section
  }
  return new File([new Uint8Array(await pdf.save())], "cv.pdf", { type: "application/pdf" });
}

describe("extractCvText", () => {
  it("reads a Word file into one paragraph per line", async () => {
    const text = await extractCvText(await makeDocx());
    expect(segment(text)).toEqual([
      "Built ETL pipelines with Airflow and dbt",
      "Led a team of four engineers",
      "Finnish (native) and English (fluent)",
    ]);
  });

  it("reads a PDF, rebuilding lines and section breaks", async () => {
    const file = await makePdf([
      "Experience",
      "Built ETL pipelines with Airflow and dbt",
      "Led a team of four engineers",
      "",
      "Skills",
      "Docker, Terraform and GitHub Actions",
    ]);
    const text = await extractCvText(file);
    expect(text).toContain("Led a team of four engineers\n\nSkills");
    expect(segment(text)).toEqual([
      "Built ETL pipelines with Airflow and dbt",
      "Led a team of four engineers",
      "Docker, Terraform and GitHub Actions",
    ]);
  });

  it("reads plain-text files as they are", async () => {
    const file = new File(["- Built ETL pipelines in Python"], "cv.txt", { type: "text/plain" });
    expect(await extractCvText(file)).toBe("- Built ETL pipelines in Python");
  });

  it("recognises the format from the file extension when the browser gives no type", async () => {
    const pdf = await makePdf(["Led a team of four engineers"]);
    const untyped = new File([await pdf.arrayBuffer()], "CV.PDF");
    expect(await extractCvText(untyped)).toBe("Led a team of four engineers");
  });

  it("explains that a PDF without a text layer (e.g. a scan) cannot be read", async () => {
    await expect(extractCvText(await makePdf([]))).rejects.toThrow(/no text.*scanned/i);
  });

  it("rejects unsupported formats, naming the supported ones", async () => {
    const image = new File([new Uint8Array([137, 80, 78, 71])], "cv.png", { type: "image/png" });
    await expect(extractCvText(image)).rejects.toThrow(/\.docx.*\.pdf/);
  });

  it("rejects the old binary .doc format with a hint to save as .docx", async () => {
    const doc = new File([new Uint8Array([0xd0, 0xcf])], "cv.doc", { type: "application/msword" });
    await expect(extractCvText(doc)).rejects.toThrow(/save it as \.docx/i);
  });

  it("rejects files larger than the limit before reading them", async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "cv.pdf", { type: "application/pdf" });
    await expect(extractCvText(big)).rejects.toThrow(/too large/i);
  });

  it("reports a corrupt file as unreadable rather than crashing", async () => {
    const broken = new File(["not really a pdf"], "cv.pdf", { type: "application/pdf" });
    await expect(extractCvText(broken)).rejects.toThrow(/could not read/i);
  });
});
