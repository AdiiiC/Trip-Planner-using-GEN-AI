"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type TableBlock = { type: "table"; headers: string[]; rows: string[][] };
type TextBlock = { type: "heading" | "paragraph" | "bullet"; text: string };
type Block = TableBlock | TextBlock;
type Section = { title: string; blocks: Block[] };

const C = {
  ink: "#18181b", muted: "#60646c", line: "#d8dadd", soft: "#f4f5f5",
  accent: "#047857", accentSoft: "#dff5eb", white: "#ffffff",
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 34, paddingBottom: 38, fontFamily: "Helvetica", color: C.ink },
  brand: { fontSize: 8, color: C.accent, letterSpacing: 1.2, textTransform: "uppercase" },
  title: { fontSize: 21, fontFamily: "Helvetica-Bold", marginTop: 5 },
  meta: { flexDirection: "row", gap: 14, marginTop: 7, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  metaText: { fontSize: 8, color: C.muted },
  sectionTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 8 },
  heading: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.accent, marginTop: 8, marginBottom: 3 },
  paragraph: { fontSize: 8.5, lineHeight: 1.45, marginBottom: 5 },
  bulletRow: { flexDirection: "row", gap: 5, marginBottom: 3, paddingLeft: 3 },
  bullet: { width: 7, fontSize: 8.5, color: C.accent },
  bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.4 },
  table: { borderWidth: 1, borderColor: C.line, marginTop: 4, marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, minHeight: 24 },
  lastRow: { borderBottomWidth: 0 },
  headRow: { backgroundColor: C.accent },
  cell: { paddingVertical: 5, paddingHorizontal: 5, borderRightWidth: 0.5, borderRightColor: C.line, justifyContent: "center" },
  lastCell: { borderRightWidth: 0 },
  headText: { color: C.white, fontSize: 7.2, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  cellText: { fontSize: 7.2, lineHeight: 1.35 },
  alternate: { backgroundColor: C.soft },
  note: { marginTop: 10, padding: 8, backgroundColor: C.accentSoft, borderLeftWidth: 3, borderLeftColor: C.accent },
  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
  footerText: { fontSize: 7, color: C.muted },
});

function clean(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<br\s*\/?>/gi, " · ")
    .trim();
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(clean);
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (line.startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^#{3,}\s+/.test(line)) {
      blocks.push({ type: "heading", text: clean(line.replace(/^#{3,}\s+/, "")) });
      index += 1;
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: clean(line.replace(/^(?:[-*+]|\d+[.)])\s+/, "")) });
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || next.startsWith("|") || /^#{2,}\s+/.test(next) || /^[-*+]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: clean(paragraph.join(" ")) });
  }
  return blocks;
}

function parseSections(markdown: string): Section[] {
  const parts = markdown.split(/(?=^##\s+)/m).filter(part => part.trim());
  return parts.map((part, index) => {
    const match = part.match(/^##\s+([^\n]+)\n?/);
    return {
      title: clean(match?.[1] ?? (index === 0 ? "Trip Overview" : `Section ${index + 1}`)),
      blocks: parseBlocks(match ? part.slice(match[0].length) : part),
    };
  });
}

function widths(headers: string[]): number[] {
  if (headers.length === 6) return [12, 18, 27, 10, 10, 23];
  if (headers.length === 5) return [14, 20, 30, 12, 24];
  return headers.map(() => 100 / Math.max(headers.length, 1));
}

function PdfTable({ block }: { block: TableBlock }) {
  const columnWidths = widths(block.headers);
  const renderRow = (rowCells: string[], header = false, rowIndex = 0) => (
    <View key={header ? "header" : rowIndex} style={[s.row, header ? s.headRow : {}, !header && rowIndex % 2 === 1 ? s.alternate : {}, !header && rowIndex === block.rows.length - 1 ? s.lastRow : {}]} wrap={false}>
      {block.headers.map((_, cellIndex) => (
        <View key={cellIndex} style={[s.cell, { width: `${columnWidths[cellIndex]}%` }, cellIndex === block.headers.length - 1 ? s.lastCell : {}]}>
          <Text style={header ? s.headText : s.cellText}>{rowCells[cellIndex] ?? ""}</Text>
        </View>
      ))}
    </View>
  );
  return <View style={s.table}>{renderRow(block.headers, true)}{block.rows.map((row, index) => renderRow(row, false, index))}</View>;
}

function PdfBlock({ block }: { block: Block }) {
  if (block.type === "table") return <PdfTable block={block} />;
  if (block.type === "heading") return <Text style={s.heading}>{block.text}</Text>;
  if (block.type === "bullet") return <View style={s.bulletRow} wrap={false}><Text style={s.bullet}>•</Text><Text style={s.bulletText}>{block.text}</Text></View>;
  return <Text style={s.paragraph}>{block.text}</Text>;
}

function PlannerDocument({ city, days, travelDate, itinerary }: { city: string; days: number; travelDate: string; itinerary: string }) {
  const sections = parseSections(itinerary);
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Document title={`${city || "Trip"} itinerary`} author="Wayfare">
      {sections.map((section, index) => (
        <Page key={`${section.title}-${index}`} size="A4" orientation="landscape" style={s.page} wrap>
          <Text style={s.brand}>Wayfare · AI Trip Planner</Text>
          <Text style={s.title}>{city || "Trip Itinerary"}</Text>
          <View style={s.meta}>
            <Text style={s.metaText}>{days} day{days === 1 ? "" : "s"}</Text>
            <Text style={s.metaText}>Travel date: {travelDate || "Not specified"}</Text>
            <Text style={s.metaText}>Prepared: {generated}</Text>
          </View>
          <Text style={s.sectionTitle}>{section.title}</Text>
          {section.blocks.map((block, blockIndex) => <PdfBlock key={blockIndex} block={block} />)}
          {index === sections.length - 1 && <View style={s.note}><Text style={s.paragraph}>Planning note: Prices, opening hours, visa rules, and transport schedules can change. Verify critical details before booking.</Text></View>}
          <View style={s.footer} fixed>
            <Text style={s.footerText}>Wayfare · Considered trip planning</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function generatePlannerPdfBlob(input: { city: string; days: number; travelDate: string; itinerary: string }): Promise<Blob> {
  return pdf(<PlannerDocument {...input} />).toBlob();
}
