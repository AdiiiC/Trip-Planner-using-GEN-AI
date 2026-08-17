// Compares two saved budget-plan payloads line by line, so plan history can say
// "the Bangkok hotel added ₹8,000" instead of just showing a new total.
//
// Payloads are the budget form's own values, stored as opaque JSON, so everything
// here reads defensively: an old snapshot may be missing fields the form has since
// gained, and nothing may be assumed about types.

export type DiffKind = "added" | "removed" | "changed";

export interface DiffRow {
  section: string;
  label: string;
  kind: DiffKind;
  /** Signed, in INR: positive means the edit made the trip more expensive. */
  deltaINR: number;
  fromINR?: number;
  toINR?: number;
}

export interface PlanDiff {
  rows: DiffRow[];
  /**
   * Sum of the rows above. The authoritative change is the difference between the
   * two stored totals — this only explains which lines account for it, and can
   * differ when something structural changed (traveller count, a split type).
   */
  attributedINR: number;
}

type Payload = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rows = (p: Payload, key: string): Payload[] =>
  Array.isArray(p[key]) ? (p[key] as unknown[]).filter((r): r is Payload => typeof r === "object" && r !== null) : [];

/** INR-per-unit table from a payload's own exchange rates, so each side of the
 *  comparison is valued with the rates it was saved with. */
function rateTable(p: Payload): Record<string, number> {
  const table: Record<string, number> = { INR: 1 };
  for (const r of rows(p, "exchange_rates")) {
    const code = str(r.currency).toUpperCase();
    const rate = num(r.rate_to_inr);
    if (code && rate > 0) table[code] = rate;
  }
  return table;
}

const toINR = (amount: number, currency: string, table: Record<string, number>) =>
  amount * (table[currency.toUpperCase()] ?? 1);

/** Keys duplicates apart so two "Museum" rows don't collapse into one. */
function keyed(items: Payload[], label: (item: Payload) => string, value: (item: Payload) => number) {
  const out = new Map<string, { label: string; value: number }>();
  const seen = new Map<string, number>();
  items.forEach(item => {
    const base = label(item).trim() || "(unnamed)";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(n > 1 ? `${base}#${n}` : base, { label: base, value: value(item) });
  });
  return out;
}

function compareSection(
  section: string,
  before: Map<string, { label: string; value: number }>,
  after: Map<string, { label: string; value: number }>,
): DiffRow[] {
  const out: DiffRow[] = [];
  for (const [key, a] of after) {
    const b = before.get(key);
    if (!b) {
      out.push({ section, label: a.label, kind: "added", deltaINR: a.value, toINR: a.value });
    } else if (Math.round(a.value) !== Math.round(b.value)) {
      out.push({
        section, label: a.label, kind: "changed",
        deltaINR: a.value - b.value, fromINR: b.value, toINR: a.value,
      });
    }
  }
  for (const [key, b] of before) {
    if (!after.has(key)) {
      out.push({ section, label: b.label, kind: "removed", deltaINR: -b.value, fromINR: b.value });
    }
  }
  return out;
}

export function diffPlans(beforeRaw: unknown, afterRaw: unknown): PlanDiff {
  const before = (beforeRaw ?? {}) as Payload;
  const after = (afterRaw ?? {}) as Payload;
  const rb = rateTable(before);
  const ra = rateTable(after);

  const out: DiffRow[] = [
    ...compareSection("Flights",
      keyed(rows(before, "flights"), f => str(f.route) || "Flight", f => num(f.price_inr)),
      keyed(rows(after, "flights"), f => str(f.route) || "Flight", f => num(f.price_inr))),
    ...compareSection("Stays",
      keyed(rows(before, "accommodations"), s => str(s.destination), s => num(s.total_cost_inr)),
      keyed(rows(after, "accommodations"), s => str(s.destination), s => num(s.total_cost_inr))),
    ...compareSection("Sightseeing",
      keyed(rows(before, "sightseeing"), s => str(s.name), s => toINR(num(s.amount), str(s.currency), rb)),
      keyed(rows(after, "sightseeing"), s => str(s.name), s => toINR(num(s.amount), str(s.currency), ra))),
    ...compareSection("Extras",
      keyed(rows(before, "extras"), e => str(e.name), e => toINR(num(e.amount), str(e.currency), rb)),
      keyed(rows(after, "extras"), e => str(e.name), e => toINR(num(e.amount), str(e.currency), ra))),
    ...compareSection("Cash",
      keyed(rows(before, "cash_conversions"), c => `${str(c.currency)} cash`, c => num(c.amount_inr)),
      keyed(rows(after, "cash_conversions"), c => `${str(c.currency)} cash`, c => num(c.amount_inr))),
  ];

  // Pocket money is entered in USD but only means anything in INR here.
  const pocketBefore = num(before.pocket_money_usd) * (rb.USD ?? 0);
  const pocketAfter = num(after.pocket_money_usd) * (ra.USD ?? 0);
  if (Math.round(pocketBefore) !== Math.round(pocketAfter)) {
    out.push({
      section: "Pocket money", label: "Pocket money", kind: "changed",
      deltaINR: pocketAfter - pocketBefore, fromINR: pocketBefore, toINR: pocketAfter,
    });
  }

  // Structural changes carry no INR of their own but explain why the rows above
  // don't add up to the total.
  const travellersBefore = num(before.travelers);
  const travellersAfter = num(after.travelers);
  if (travellersBefore !== travellersAfter && travellersBefore && travellersAfter) {
    out.push({
      section: "Travellers", label: `${travellersBefore} → ${travellersAfter} travellers`,
      kind: "changed", deltaINR: 0,
    });
  }
  const nightsBefore = num(before.nights);
  const nightsAfter = num(after.nights);
  if (nightsBefore !== nightsAfter) {
    out.push({
      section: "Trip length", label: `${nightsBefore || "?"} → ${nightsAfter || "?"} nights`,
      kind: "changed", deltaINR: 0,
    });
  }

  out.sort((a, b) => Math.abs(b.deltaINR) - Math.abs(a.deltaINR));
  return { rows: out, attributedINR: out.reduce((sum, r) => sum + r.deltaINR, 0) };
}
