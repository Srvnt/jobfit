/**
 * A PDF has no lines or paragraphs, only positioned runs of text. This rebuilds
 * readable lines from those runs so the segmenter can treat a PDF like typed text.
 */

export interface TextPiece {
  str: string;
  /** Left edge, in PDF points. */
  x: number;
  /** Baseline, in PDF points from the bottom of the page. */
  y: number;
  width: number;
  /** Font size, roughly. */
  height: number;
}

interface Line {
  y: number;
  height: number;
  pieces: TextPiece[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function groupIntoLines(pieces: TextPiece[]): Line[] {
  const lines: Line[] = [];
  for (const p of pieces) {
    const line = lines.find((l) => Math.abs(l.y - p.y) <= Math.max(l.height, p.height) * 0.5);
    if (line) line.pieces.push(p);
    else lines.push({ y: p.y, height: p.height, pieces: [p] });
  }
  return lines.sort((a, b) => b.y - a.y); // PDF y grows upwards
}

function lineText(line: Line): string {
  const pieces = [...line.pieces].sort((a, b) => a.x - b.x);
  let text = "";
  let end = -Infinity;
  for (const p of pieces) {
    const gap = p.x - end;
    if (text && gap > p.height * 0.2 && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " ";
    text += p.str;
    end = p.x + p.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Turns positioned text runs into lines, with a blank line between visually separate blocks. */
export function layoutText(pieces: TextPiece[]): string {
  const lines = groupIntoLines(pieces.filter((p) => p.str.trim()));
  if (lines.length === 0) return "";

  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y);
  const normalGap = gaps.length ? median(gaps) : 0;

  return lines
    .map((line, i) => (i > 0 && gaps[i - 1] > normalGap * 1.5 ? "\n" : "") + lineText(line))
    .join("\n");
}
