/* Slide text is plain text with three conventions: "- " starts a bullet, **bold**, *italic*. */
export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Line = { bullet: boolean; runs: Run[] };

export function parseRuns(line: string): Run[] {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let at = 0, m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, italic: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}
export function parseLines(text: string): Line[] {
  return text.split("\n").map((raw) => {
    const m = /^\s*(?:[-*•])\s+(.*)$/.exec(raw);
    return { bullet: !!m, runs: parseRuns(m ? m[1]! : raw) };
  });
}
/** Markdown from a model, reduced to what a slide can hold: headings and tables become plain lines, list markers become "- ". */
export function toSlideText(markdown: string, max = 1200): string {
  return markdown.replace(/\r/g, "").split("\n").map((l) => l.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*(?:[*•]|\d+[.)])\s+/, "- ").replace(/^\s*-\s+/, "- ").replace(/^\s*>\s?/, "").trimEnd())
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim().slice(0, max);
}
export const plain = (text: string) => parseLines(text).map((l) => l.runs.map((r) => r.text).join("")).join("\n");
