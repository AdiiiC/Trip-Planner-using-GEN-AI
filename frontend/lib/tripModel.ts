/**
 * Local itinerary operations. Everything here runs client-side with no LLM call.
 *
 * Time shifting rewrites `HH:MM` tokens in place rather than parsing the document
 * into a tree and re-serialising it, so no formatting or prose is ever lost.
 */

// The meridiem and its spacing are one optional group, so a bare `09:00` leaves
// the following whitespace outside the match and therefore untouched.
const TIME = /\b(\d{1,2}):(\d{2})(?:(\s*)(a\.?m\.?|p\.?m\.?))?/gi;

function toMinutes(hour: number, minute: number, meridiem: string | undefined): number {
  let h = hour;
  if (meridiem) {
    const pm = /p/i.test(meridiem);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h * 60 + minute;
}

/** Shift every clock time in `text` by `deltaMinutes`, wrapping within the day. */
export function shiftTimes(text: string, deltaMinutes: number): string {
  if (!deltaMinutes) return text;

  return text.replace(TIME, (_full, h: string, m: string, gap: string, mer?: string) => {
    const total = toMinutes(Number(h), Number(m), mer) + deltaMinutes;
    const wrapped = ((total % 1440) + 1440) % 1440;
    const hour24 = Math.floor(wrapped / 60);
    const minute = String(wrapped % 60).padStart(2, "0");

    // Echo the source token's own style: zero padding, 12h/24h, dots and casing.
    if (!mer) {
      const hh = h.length === 2 ? String(hour24).padStart(2, "0") : String(hour24);
      return `${hh}:${minute}`;
    }
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    let suffix = hour24 >= 12 ? "pm" : "am";
    if (/\./.test(mer)) suffix = `${suffix[0]}.${suffix[1]}.`;
    if (mer === mer.toUpperCase()) suffix = suffix.toUpperCase();
    return `${hour12}:${minute}${gap}${suffix}`;
  });
}

/** True when the line carries at least one clock time. */
export function hasTime(line: string): boolean {
  TIME.lastIndex = 0;
  return TIME.test(line);
}

// ─── costs ────────────────────────────────────────────────────────────────────

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD", "US$": "USD", "S$": "SGD", "RM": "MYR",
  "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY", "฿": "THB", "₫": "VND",
};

const MONEY = new RegExp(
  [
    String.raw`(US\$|S\$|RM|[$€£₹¥฿₫])\s*([\d,]+(?:\.\d+)?)`,
    String.raw`([\d,]+(?:\.\d+)?)\s*([A-Z]{3})\b`,
    String.raw`\b([A-Z]{3})\s*([\d,]+(?:\.\d+)?)`,
  ].join("|"),
  "g",
);

// Order is significant: the first match wins, and a line like "Grab to hotel"
// or "airport taxi" names its destination as well as its mode.
const CATEGORY_WORDS: [string, RegExp][] = [
  ["transport", /\b(taxi|grab|uber|metro|subway|bus|train|tuk[- ]?tuk|ferry|transfer|scooter|rental)\b/i],
  ["flight", /\b(flight|airport|airline|boarding|departure|arrival)\b/i],
  ["stay", /\b(hotel|hostel|resort|accommodation|check[- ]?in|guesthouse|airbnb)\b/i],
  ["food", /\b(breakfast|lunch|dinner|brunch|cafe|café|restaurant|street food|meal|coffee|bar|drinks?|snack)\b/i],
  ["sightseeing", /\b(museum|temple|tour|ticket|entry|admission|park|gallery|palace|shrine|market|cruise|show)\b/i],
];

function categorise(line: string): string {
  for (const [name, pattern] of CATEGORY_WORDS) {
    if (pattern.test(line)) return name;
  }
  return "extra";
}

/** Strip markdown noise so the item reads like a label rather than a source line. */
function label(line: string): string {
  return line
    .replace(/^[\s>*\-+]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

export interface CostItem {
  name: string;
  category: string;
  amount: number;
  currency: string;
}

export interface CostReport {
  items: CostItem[];
  total_estimate: number;
  currency: string;
}

/**
 * Pull cost line-items straight out of the itinerary markdown.
 * Replaces an LLM extraction round-trip that re-read the whole plan.
 */
export function parseCosts(markdown: string, preferred = "USD"): CostReport {
  const want = preferred.toUpperCase();
  const items: CostItem[] = [];

  for (const line of markdown.split("\n")) {
    if (/^#{1,6}\s/.test(line)) continue;

    const found: { amount: number; currency: string }[] = [];
    for (const m of line.matchAll(MONEY)) {
      const [, sym, symAmount, amountFirst, codeAfter, codeFirst, codeAmount] = m;
      const rawAmount = symAmount ?? amountFirst ?? codeAmount;
      const code = sym ? SYMBOL_TO_CODE[sym] : (codeAfter ?? codeFirst);
      const value = Number((rawAmount ?? "").replace(/,/g, ""));
      if (!code || !Number.isFinite(value) || value <= 0) continue;
      found.push({ amount: value, currency: code.toUpperCase() });
    }
    if (!found.length) continue;

    // A line often prints the same price twice, e.g. "1,200 THB ($35)".
    const chosen = found.find(f => f.currency === want) ?? found[0];
    const name = label(line);
    if (name) items.push({ name, category: categorise(line), ...chosen });
  }

  const total = items
    .filter(i => i.currency === (items[0]?.currency ?? want))
    .reduce((sum, i) => sum + i.amount, 0);

  return { items, total_estimate: total, currency: items[0]?.currency ?? want };
}
