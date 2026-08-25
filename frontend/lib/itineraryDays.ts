// Groq emits narrow no-break spaces in headings, so `\s` is used rather than a literal space.
const DAY_HEADING = /^##\s+Day\s*(\d+)/;

export interface DaySection {
  day: number;
  title: string;
  markdown: string;
}

/** Line index and day number of every `## Day N` heading, in document order. */
function scanHeadings(lines: string[]): { line: number; day: number }[] {
  const found: { line: number; day: number }[] = [];
  lines.forEach((text, line) => {
    const match = DAY_HEADING.exec(text);
    if (match) found.push({ line, day: Number(match[1]) });
  });
  return found;
}

/** Split an itinerary into its `## Day N` sections. Preamble before the first day is dropped. */
export function splitDays(itinerary: string): DaySection[] {
  const lines = itinerary.split("\n");
  const headings = scanHeadings(lines);

  return headings.map((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
    return {
      day: heading.day,
      title: lines[heading.line].replace(/^##\s+/, "").trim(),
      markdown: lines.slice(heading.line, end).join("\n").trimEnd(),
    };
  });
}

/** Splice a revised day back into the full itinerary. Returns the original if the day is absent. */
export function replaceDay(itinerary: string, day: number, revised: string): string {
  const lines = itinerary.split("\n");
  const headings = scanHeadings(lines);
  const index = headings.findIndex(h => h.day === day);
  if (index === -1) return itinerary;

  const from = headings[index].line;
  const isLast = index + 1 >= headings.length;
  const to = isLast ? lines.length : headings[index + 1].line;

  return [
    ...lines.slice(0, from),
    ...revised.trimEnd().split("\n"),
    // trimEnd() ate the separator the next heading needs.
    ...(isLast ? [] : [""]),
    ...lines.slice(to),
  ].join("\n");
}
