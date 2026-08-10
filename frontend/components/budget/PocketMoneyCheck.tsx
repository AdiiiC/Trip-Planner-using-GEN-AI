"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, CheckCircle2, TriangleAlert, Info, Banknote, Wand2, ArrowRight } from "lucide-react";
import type { BudgetResult } from "@/lib/types";
import { formatINR, formatUSD, formatNumber, cn } from "@/lib/utils";

// Extras whose name looks like something you pay for in India before flying out.
// Mirrors the backend classifier — "card" is excluded so "SIM Card" stays on-arrival.
const PREPAID_HINT = /visa|insurance|forex|booking|deposit|ticket/i;

const DEFAULT_NIGHTS = 3;
const DEFAULT_DAILY_INR = 1500;

const PRIORITY_WEIGHT = { high: 1.5, normal: 1, low: 0.7 } as const;
type Priority = keyof typeof PRIORITY_WEIGHT;
const PRIORITIES: Priority[] = ["high", "normal", "low"];

const PRIORITY_CLS: Record<Priority, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  normal: "border-[var(--border)] text-[var(--fg-muted)]",
  low: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

interface CountryRow {
  name: string;
  nights: number;
  dailyInr: number;
  priority: Priority;
  actualInr: number | null;
}

// Notes a forex desk actually hands over, largest first
const DENOMS: Record<string, number[]> = {
  USD: [100], // Indian forex desks issue USD in $100 notes only
  EUR: [100, 50, 20],
  GBP: [50, 20, 10],
  AED: [100, 50, 20],
  SGD: [100, 50, 10],
  MYR: [100, 50, 20, 10],
  THB: [1000, 500, 100],
  VND: [500_000, 200_000, 100_000, 50_000],
  IDR: [100_000, 50_000, 20_000],
  JPY: [10_000, 5_000, 1_000],
};
const FALLBACK_DENOMS = [100, 50, 20, 10];

// Granularity worth rounding a purchase to — not always the largest note
const ROUND_STEP: Record<string, number> = {
  USD: 100,
  EUR: 50,
  GBP: 50,
  AED: 50,
  SGD: 50,
  MYR: 50,
  THB: 500,
  VND: 500_000,
  IDR: 50_000,
  JPY: 1_000,
};
const FALLBACK_STEP = 50;

function roundToNotes(amount: number, currency: string): number {
  const step = ROUND_STEP[currency] ?? FALLBACK_STEP;
  if (amount <= 0) return 0;
  return Math.max(step, Math.round(amount / step) * step);
}

/** "3 × 500,000 + 1 × 100,000" — greedy largest-note-first split. */
function noteBreakdown(amount: number, currency: string): string {
  const denoms = DENOMS[currency] ?? FALLBACK_DENOMS;
  const parts: string[] = [];
  let left = amount;
  for (const d of denoms) {
    const n = Math.floor(left / d);
    if (n > 0) {
      parts.push(`${n} × ${formatNumber(d)}`);
      left -= n * d;
    }
    if (left <= 0) break;
  }
  if (left > 0) parts.push(`+ ${formatNumber(left)}`);
  return parts.join(" + ");
}

interface CountryPlan extends CountryRow {
  booked: number;
  living: number;
  total: number;
}

/** Walks the legs in order, rolling unspent cash forward minus the FX round-trip cost. */
function buildLedger(plans: CountryPlan[], recoveryPct: number) {
  let carry = 0;
  const rows = plans.map((c) => {
    const carryIn = carry;
    const available = c.total + carryIn;
    let carryOut: number | null = null;
    if (c.actualInr != null) {
      const diff = available - c.actualInr;
      carryOut = diff > 0 ? (diff * recoveryPct) / 100 : diff;
      carry = carryOut;
    }
    return { ...c, carryIn, available, carryOut };
  });
  return { rows, finalCarry: carry };
}

export function PocketMoneyCheck({ result }: { result: BudgetResult }) {
  const fc = result.fixed_costs;
  const cc = result.cash_conversion;
  const usdRate = result.rates_used?.USD ?? 0;
  const toUsd = (inr: number) => (usdRate > 0 ? inr / usdRate : 0);

  // Every destination that shows up anywhere in the trip, in first-seen order
  const destinations = useMemo(() => {
    const seen: string[] = [];
    const push = (d?: string) => {
      const v = (d ?? "").trim();
      if (v && !seen.includes(v)) seen.push(v);
    };
    fc.stays.items.forEach((s) => push(s.destination));
    fc.sightseeing.items.forEach((s) => push(s.destination));
    fc.extras.items.forEach((e) => push(e.destination));
    return seen;
  }, [fc]);

  const destKey = destinations.join("|");

  // Only user edits are stored; the row list itself follows the budget result
  const [overrides, setOverrides] = useState<Record<string, Partial<CountryRow>>>({});
  const rows: CountryRow[] = useMemo(
    () =>
      destKey
        .split("|")
        .filter(Boolean)
        .map((name) => ({
          name,
          nights: DEFAULT_NIGHTS,
          dailyInr: DEFAULT_DAILY_INR,
          priority: "normal" as Priority,
          actualInr: null,
          ...overrides[name],
        })),
    [destKey, overrides]
  );

  const [prepaidOverrides, setPrepaidOverrides] = useState<Record<string, boolean>>({});
  // Prefer the backend's classification; fall back to the name heuristic
  const prepaidByName = useMemo(() => {
    const m: Record<string, boolean> = {};
    fc.extras.items.forEach((e) => {
      if (typeof e.prepaid === "boolean") m[e.name] = e.prepaid;
    });
    return m;
  }, [fc.extras.items]);
  const prepaidDefault = (name: string) => prepaidByName[name] ?? PREPAID_HINT.test(name);
  const isPrepaid = (name: string) => prepaidOverrides[name] ?? prepaidDefault(name);
  const togglePrepaid = (name: string) =>
    setPrepaidOverrides((p) => ({ ...p, [name]: !(p[name] ?? prepaidDefault(name)) }));

  const update = (i: number, patch: Partial<CountryRow>) => {
    const name = rows[i]?.name;
    if (!name) return;
    setOverrides((o) => ({ ...o, [name]: { ...o[name], ...patch } }));
  };

  const updateNum = (i: number, field: "nights" | "dailyInr", v: number) =>
    update(i, { [field]: Number.isFinite(v) ? Math.max(0, v) : 0 });

  // Held back from the priority split so any country can draw on it mid-trip
  const [reservePct, setReservePct] = useState(10);
  // Share of unspent local cash you keep when moving on — 97% if you sell it
  // back to USD before leaving, ~88% if you carry it across the border
  const [recoveryPct, setRecoveryPct] = useState(97);
  const [tracking, setTracking] = useState(false);

  // Sightseeing is always paid on the ground; extras only if not prepaid at home
  const committedSight = fc.sightseeing.items.reduce((s, i) => s + i.amount_inr, 0);
  const committedExtras = fc.extras.items.filter((e) => !isPrepaid(e.name)).reduce((s, i) => s + i.amount_inr, 0);
  const committed = committedSight + committedExtras;

  const perCountry: CountryPlan[] = rows.map((r) => {
    const sight = fc.sightseeing.items.filter((i) => i.destination === r.name).reduce((s, i) => s + i.amount_inr, 0);
    const extras = fc.extras.items
      .filter((i) => i.destination === r.name && !isPrepaid(i.name))
      .reduce((s, i) => s + i.amount_inr, 0);
    const living = r.nights * r.dailyInr;
    return { ...r, booked: sight + extras, living, total: sight + extras + living };
  });

  const unassigned = committed - perCountry.reduce((s, c) => s + c.booked, 0);
  const nights = rows.reduce((s, r) => s + r.nights, 0);
  const pocket = cc.pocket_money_inr;
  const need = perCountry.reduce((s, c) => s + c.total, 0) + Math.max(unassigned, 0);
  const surplus = pocket - need;
  const freeSpend = pocket - committed;
  const perDay = nights > 0 ? freeSpend / nights : 0;
  const covered = surplus >= 0;
  const reserve = (freeSpend * reservePct) / 100;

  // Split the free spend across destinations by nights × priority weight
  const distribute = () => {
    const pool = freeSpend - reserve;
    const weights = rows.map((r) => r.nights * PRIORITY_WEIGHT[r.priority]);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (pool <= 0 || totalWeight <= 0) return;
    setOverrides((o) => {
      const next = { ...o };
      rows.forEach((r, i) => {
        const daily = r.nights > 0 ? Math.round((pool * weights[i]) / totalWeight / r.nights / 10) * 10 : 0;
        next[r.name] = { ...next[r.name], dailyInr: daily };
      });
      return next;
    });
  };

  // Unspent cash rolls into the next leg, minus whatever the FX round-trip costs
  const { rows: ledger, finalCarry } = buildLedger(perCountry, recoveryPct);
  const tracked = ledger.some((c) => c.carryOut != null);
  const comingHome = finalCarry + reserve;

  // Round every currency purchase to notes the forex desk can actually hand over,
  // then let the USD balance absorb the difference
  const forex = useMemo(() => {
    const legs = cc.allocations.map((a) => {
      const rate = result.rates_used?.[a.currency] ?? 0;
      const clean = roundToNotes(a.foreign_amount, a.currency);
      return {
        currency: a.currency,
        raw: a.foreign_amount,
        clean,
        inr: clean * rate,
        notes: noteBreakdown(clean, a.currency),
      };
    });
    const localInr = legs.reduce((s, l) => s + l.inr, 0);
    const usdClean = usdRate > 0 ? roundToNotes((pocket - localInr) / usdRate, "USD") : 0;
    const usdInr = usdClean * usdRate;
    const total = localInr + usdInr;
    return { legs, usdClean, usdInr, total, delta: total - pocket, totalUsd: usdRate > 0 ? total / usdRate : 0 };
  }, [cc.allocations, result.rates_used, usdRate, pocket]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass rounded-2xl p-5 space-y-4"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-semibold text-white">Pocket Money Reality Check</p>
        </div>
        <p className="text-xs text-[var(--fg-muted)]">
          Sightseeing and on-arrival extras sit in Fixed Costs but are actually paid in local cash out of this same
          pocket money. This works out what&apos;s genuinely left to spend.
        </p>
      </div>

      {/* Verdict */}
      <div
        className={cn(
          "rounded-xl border px-4 py-3 flex items-start gap-3",
          covered ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"
        )}
      >
        {covered ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <TriangleAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        )}
        <div>
          <p className={cn("text-sm font-semibold", covered ? "text-emerald-300" : "text-rose-300")}>
            {covered
              ? `Covered — ${formatINR(surplus)} spare (${formatUSD(toUsd(surplus))})`
              : `Short by ${formatINR(-surplus)} (${formatUSD(toUsd(-surplus))})`}
          </p>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">
            {formatINR(pocket)} pocket money vs {formatINR(need)} needed on the ground
            {!covered && usdRate > 0 && ` · carry about $${Math.ceil(toUsd(-surplus) / 10) * 10} more`}
          </p>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Pocket money" value={formatINR(pocket)} sub={formatUSD(cc.pocket_money_usd)} />
        <Stat label="Already committed" value={formatINR(committed)} sub="sightseeing + on-arrival extras" />
        <Stat label="Free to spend" value={formatINR(freeSpend)} sub={formatUSD(toUsd(freeSpend))} accent />
        <Stat label="Per day" value={formatINR(perDay)} sub={`over ${nights} night${nights === 1 ? "" : "s"}`} />
      </div>

      {/* Priority split controls */}
      {perCountry.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={distribute}
            className="flex items-center gap-1.5 text-xs font-medium rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 px-3 py-1.5 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" /> Distribute by priority
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
            Reserve
            <input
              type="number"
              min={0}
              max={50}
              value={reservePct}
              onChange={(e) => setReservePct(Math.min(50, Math.max(0, +e.target.value || 0)))}
              className="input-dark h-7 w-14 text-center px-1"
            />
            % = <span className="text-white">{formatINR(reserve)}</span>
          </label>
        </div>
      )}

      {/* Per-country need */}
      {perCountry.length > 0 && (
        <div className="space-y-2">
          {ledger.map((c, i) => (
            <div key={c.name} className="rounded-xl border border-[var(--border)] p-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-[var(--fg-muted)] shrink-0">Leg {i + 1}</span>
                <p className="text-sm text-white truncate">{c.name}</p>
                <span className="ml-auto text-sm text-white font-semibold shrink-0">{formatINR(c.total)}</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                  <input
                    type="number"
                    min={0}
                    value={c.nights}
                    onChange={(e) => updateNum(i, "nights", +e.target.value)}
                    className="input-dark h-7 w-14 text-center px-1"
                  />
                  nights
                </label>
                <label className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                  ₹
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={c.dailyInr}
                    onChange={(e) => updateNum(i, "dailyInr", +e.target.value)}
                    className="input-dark h-7 w-20 text-center px-1"
                  />
                  /day
                </label>
                <div className="flex gap-1 ml-auto">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => update(i, { priority: p })}
                      className={cn(
                        "text-[10px] capitalize rounded-md border px-2 py-1 transition-colors",
                        c.priority === p ? PRIORITY_CLS[p] : "border-[var(--border)] text-[var(--fg-muted)]/60 hover:text-white"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {c.booked > 0 && (
                <p className="text-[10px] text-[var(--fg-muted)]">
                  {formatINR(c.booked)} pre-booked + {formatINR(c.living)} free spend
                </p>
              )}

              {tracking && (
                <div className="flex items-center gap-2 flex-wrap border-t border-[var(--border)] pt-2">
                  <label className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                    Actually spent ₹
                    <input
                      type="number"
                      min={0}
                      placeholder="—"
                      value={c.actualInr ?? ""}
                      onChange={(e) =>
                        update(i, { actualInr: e.target.value === "" ? null : Math.max(0, +e.target.value) })
                      }
                      className="input-dark h-7 w-24 text-center px-1"
                    />
                  </label>
                  {c.carryIn !== 0 && (
                    <span className="text-[10px] text-[var(--fg-muted)]">
                      carried in {formatINR(c.carryIn)} · budget {formatINR(c.available)}
                    </span>
                  )}
                  {c.carryOut != null && (
                    <span
                      className={cn(
                        "ml-auto flex items-center gap-1 text-[10px] font-medium",
                        c.carryOut >= 0 ? "text-emerald-300" : "text-rose-300"
                      )}
                    >
                      <ArrowRight className="w-3 h-3" />
                      {c.carryOut >= 0 ? "carries" : "overspent"} {formatINR(Math.abs(c.carryOut))}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {unassigned > 0 && (
            <div className="flex justify-between text-xs px-3 py-2 rounded-xl border border-[var(--border)]">
              <span className="text-[var(--fg-muted)]">Unassigned (no destination set)</span>
              <span className="text-white font-medium">{formatINR(unassigned)}</span>
            </div>
          )}
        </div>
      )}

      {/* Carry-forward ledger */}
      {perCountry.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTracking((t) => !t)}
              className={cn(
                "text-[11px] rounded-lg border px-2.5 py-1 transition-colors",
                tracking
                  ? "border-indigo-500/30 bg-indigo-600/10 text-indigo-300"
                  : "border-[var(--border)] text-[var(--fg-muted)] hover:text-white"
              )}
            >
              Track actual spend
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
              Leftover keeps
              <input
                type="number"
                min={0}
                max={100}
                value={recoveryPct}
                onChange={(e) => setRecoveryPct(Math.min(100, Math.max(0, +e.target.value || 0)))}
                className="input-dark h-7 w-14 text-center px-1"
              />
              %
            </label>
          </div>
          <p className="text-[10px] text-[var(--fg-muted)]">
            Unspent cash rolls into the next leg. Use ~97% if you sell local currency back to USD before leaving, ~88%
            if you carry it across the border — VND especially is quoted badly once you leave Vietnam.
          </p>
          {tracked && (
            <div className="flex justify-between text-xs border-t border-[var(--border)] pt-2">
              <span className="text-[var(--fg-muted)]">Projected to come home (incl. reserve)</span>
              <span className={cn("font-semibold", comingHome >= 0 ? "text-emerald-300" : "text-rose-300")}>
                {formatINR(comingHome)} ({formatUSD(toUsd(comingHome))})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Which extras are prepaid at home */}
      {fc.extras.items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-white">Paid in India before departure</p>
          <p className="text-[10px] text-[var(--fg-muted)]">
            Untick anything you&apos;ll actually pay for on arrival — it then competes for your pocket money.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {fc.extras.items.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => togglePrepaid(e.name)}
                className={cn(
                  "text-[11px] rounded-full border px-2.5 py-1 transition-colors",
                  isPrepaid(e.name)
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-[var(--border)] text-[var(--fg-muted)] hover:text-white"
                )}
              >
                {e.name} · {formatINR(e.amount_inr)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Forex to buy */}
      <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5 text-amber-400" />
          <p className="text-xs font-medium text-white">Forex to buy — rounded to notes you can actually get</p>
        </div>

        {forex.legs.map((l) => (
          <div key={l.currency} className="flex items-baseline justify-between gap-2 text-[11px]">
            <div className="min-w-0">
              <span className="text-white font-medium">
                {formatNumber(l.clean)} {l.currency}
              </span>
              <span className="text-[var(--fg-muted)] ml-2">{l.notes}</span>
              {Math.round(l.raw) !== l.clean && (
                <span className="text-[var(--fg-muted)]/60 ml-2">from {formatNumber(l.raw)}</span>
              )}
            </div>
            <span className="text-white shrink-0">{formatINR(l.inr)}</span>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <div className="min-w-0">
            <span className="text-white font-medium">{formatNumber(forex.usdClean)} USD</span>
            <span className="text-[var(--fg-muted)] ml-2">{noteBreakdown(forex.usdClean, "USD")}</span>
            <span className="text-[var(--fg-muted)]/60 ml-2">balance, carried as cash</span>
          </div>
          <span className="text-white shrink-0">{formatINR(forex.usdInr)}</span>
        </div>

        <div className="flex justify-between text-[11px] border-t border-[var(--border)] pt-1.5">
          <span className="text-[var(--fg-muted)]">
            Set pocket money to <span className="text-white font-medium">{formatUSD(forex.totalUsd)}</span>
          </span>
          <span className="text-white font-medium">
            {formatINR(forex.total)}
            {Math.abs(forex.delta) >= 1 && (
              <span className={cn("ml-2 font-normal", forex.delta > 0 ? "text-amber-300" : "text-[var(--fg-muted)]")}>
                {forex.delta > 0 ? "+" : "−"}
                {formatINR(Math.abs(forex.delta))}
              </span>
            )}
          </span>
        </div>

        <p className="text-[10px] text-[var(--fg-muted)]">
          Local currency is only an arrival buffer — SIM, airport transfer, first meal. Everything else rides as USD,
          which carries between legs at no loss and converts better in-country than at an Indian forex desk.
        </p>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] text-[var(--fg-muted)]">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        Figures are per person. Accommodation and flights are prepaid, so they never draw on pocket money — changing a
        hotel moves your Fixed Costs, not this panel.
      </p>
    </motion.div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)] mb-1">{label}</p>
      <p className={cn("text-base font-semibold", accent ? "text-emerald-300" : "text-white")}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--fg-muted)] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
