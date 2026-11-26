import { describe, expect, it } from "vitest";
import { layoutText, type TextPiece } from "./layout";

/** A text piece on a 12pt font, where a character is roughly 6pt wide. */
const piece = (str: string, x: number, y: number): TextPiece => ({ str, x, y, width: str.length * 6, height: 12 });

describe("layoutText", () => {
  it("returns an empty string when there are no pieces", () => {
    expect(layoutText([])).toBe("");
  });

  it("joins pieces on the same baseline, adding a space only where there is a gap", () => {
    const pieces = [piece("Built", 50, 700), piece("ETL", 86, 700), piece("pipe", 110, 700), piece("lines", 134, 700)];
    expect(layoutText(pieces)).toBe("Built ETL pipelines");
  });

  it("puts each baseline on its own line, top to bottom, whatever order the pieces come in", () => {
    const pieces = [piece("Second line here", 50, 686), piece("First line here", 50, 700)];
    expect(layoutText(pieces)).toBe("First line here\nSecond line here");
  });

  it("treats small vertical jitter as the same line", () => {
    const pieces = [piece("Python", 50, 700), piece("(4 years)", 92, 701.5)];
    expect(layoutText(pieces)).toBe("Python (4 years)");
  });

  it("inserts a blank line where the vertical gap is much larger than normal line spacing", () => {
    const pieces = [
      piece("Experience", 50, 700),
      piece("Built ETL pipelines", 50, 686),
      piece("Led a team of four", 50, 672),
      piece("Skills", 50, 630),
      piece("Docker and Terraform", 50, 616),
    ];
    expect(layoutText(pieces)).toBe(
      "Experience\nBuilt ETL pipelines\nLed a team of four\n\nSkills\nDocker and Terraform",
    );
  });

  it("ignores whitespace-only pieces", () => {
    const pieces = [piece("Hello", 50, 700), piece("   ", 80, 700), piece("world", 86, 700)];
    expect(layoutText(pieces)).toBe("Hello world");
  });
});
