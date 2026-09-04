"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Landmark,
  MapPinned,
} from "lucide-react";
import type { BudgetResult } from "@/lib/types";
import type { CashPlanNotice, CashPlanSummary, CashPlanStop } from "@/lib/cashPlan";
import { cn, formatINR, formatUSD } from "@/lib/utils";

const local = (value: number, currency: string) =>
  `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(value)} ${currency}`;

const noticeStyle: Record<CashPlanNotice["tone"], string> = {
  good: "border-emerald-500/25 bg-emerald-500/8 text-emerald-200",
  warn: "border-amber-500/25 bg-amber-500/8 text-amber-200",
  danger: "border-rose-500/25 bg-rose-500/8 text-rose-200",
  info: "border-indigo-500/25 bg-indigo-500/8 text-indigo-200",
};

function NoticeIcon({ tone }: { tone: CashPlanNotice["tone"] }) {
  if (tone === "good") return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
  if (tone === "warn" || tone === "danger") return <AlertTriangle className="w-3.5 h-3.5 shrink-0" />;
  return <Info className="w-3.5 h-3.5 shrink-0" />;
}

function RateBadge({ stop }: { stop: CashPlanStop }) {
  const label = stop.rate_status === "unknown"
    ? "Add rate"
    : stop.rate_status === "good"
      ? "Good rate"
      : stop.rate_status === "acceptable"
        ? "Break-even+"
        : "Below break-even";
  return (
    <span className={cn(
      "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
      stop.rate_status === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      stop.rate_status === "acceptable" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
      stop.rate_status === "poor" && "border-rose-500/30 bg-rose-500/10 text-rose-300",
      stop.rate_status === "unknown" && "border-white/10 bg-white/5 text-[var(--fg-muted)]",
    )}>
      {label}
    </span>
  );
}

export function CashPlanStatus({ plan }: { plan: CashPlanSummary }) {
  const blockers = plan.notices.filter((notice) => notice.tone === "danger");
  const cautions = plan.notices.filter((notice) => notice.tone === "warn");
  const ready = blockers.length === 0;

  return (
    <div className={cn(
      "glass rounded-2xl border p-4",
      ready ? "border-emerald-500/25" : "border-rose-500/30",
    )}>
      <div className="flex items-start gap-3">
        {ready
          ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          : <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {ready ? "Budget and cash plan look workable" : "Cash plan needs attention"}
          </p>
          <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
            {ready
              ? `${formatINR(plan.projected_saving_inr)} projected FX saving${cautions.length ? ` · ${cautions.length} caution${cautions.length === 1 ? "" : "s"}` : ""}`
              : blockers[0]?.text}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CountryPlanPanel({ plan, rates }: { plan: CashPlanSummary; rates: Record<string, number> }) {
  const segments = [
    ...plan.stops.map((stop, index) => ({
      label: stop.destination,
      value: stop.local_total * (rates[stop.currency] ?? 0),
      color: ["#22d3ee", "#a3e635", "#fbbf24", "#f472b6"][index % 4],
    })),
    { label: "USD reserve", value: Math.max(plan.reserve_usd, 0) * (rates.USD ?? 0), color: "#818cf8" },
  ].filter((segment) => segment.value > 0);
  const segmentTotal = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (plan.stops.length === 0) {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <MapPinned className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-white">No destination exchanges yet</p>
        <p className="text-xs text-[var(--fg-muted)] mt-1">Add them under Pocket Money &amp; Cash Setup.</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <MapPinned className="w-4 h-4 text-indigo-400" /> Cash by destination
        </p>
        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">Follow the trip in order; amounts are based on your planning rates.</p>
      </div>

      {segmentTotal > 0 && (
        <div className="space-y-2">
          <div className="h-2.5 flex overflow-hidden rounded-full bg-white/5">
            {segments.map((segment) => (
              <div key={segment.label} style={{ width: `${segment.value / segmentTotal * 100}%`, background: segment.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {segments.map((segment) => (
              <span key={segment.label} className="flex items-center gap-1.5 text-[10px] text-[var(--fg-muted)]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: segment.color }} />
                {segment.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <ol className="border-y border-[var(--border)] divide-y divide-[var(--border)]">
        {plan.stops.map((stop, index) => (
          <li key={`${stop.destination}-${stop.currency}-${index}`} className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-300 text-[10px] font-semibold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <span className="text-sm font-semibold text-white">{stop.destination}</span>
              <RateBadge stop={stop} />
              <span className="ml-auto text-[10px] text-[var(--fg-muted)]">{stop.currency}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-7">
              <PlanValue label="Arrive with" value={local(stop.arrival_cash, stop.currency)} />
              <PlanValue label="Exchange locally" value={`${formatUSD(stop.usd_amount)} -> ${local(stop.local_from_usd, stop.currency)}`} />
              <PlanValue label="Listed commitments" value={local(stop.committed_local, stop.currency)} />
              <PlanValue
                label="Available afterward"
                value={local(stop.available_after_commitments, stop.currency)}
                danger={stop.available_after_commitments < 0}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <CircleDollarSign className="w-4 h-4 text-indigo-400" /> Emergency reserve
        </span>
        <span className={cn("text-sm font-semibold", plan.reserve_usd >= 100 ? "text-emerald-300" : "text-amber-300")}>
          {formatUSD(Math.max(plan.reserve_usd, 0))}
        </span>
      </div>
    </div>
  );
}

function PlanValue({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
      <p className={cn("text-[11px] font-medium mt-0.5 break-words", danger ? "text-rose-300" : "text-white")}>{value}</p>
    </div>
  );
}

export function CashFxPanel({ plan, result }: { plan: CashPlanSummary; result: BudgetResult }) {
  const cc = result.cash_conversion;
  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <Banknote className="w-4 h-4 text-emerald-400" /> Physical cash and FX
        </p>
        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">Cash that can be exchanged is separate from card balance.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CashMetric label="Physical USD" value={formatUSD(plan.physical_usd_cash)} />
        <CashMetric label="Forex card" value={formatUSD(plan.forex_card_usd)} />
        <CashMetric label="Planned exchange" value={formatUSD(plan.exchange_total_usd)} />
        <CashMetric label="USD reserve" value={formatUSD(Math.max(plan.reserve_usd, 0))} accent />
      </div>

      <div className="border-y border-[var(--border)] py-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Pack in India</p>
        {cc.allocations.map((allocation) => (
          <div key={allocation.currency} className="flex items-center justify-between text-xs">
            <span className="text-[var(--fg-muted)]">{allocation.currency} cash</span>
            <span className="text-white font-medium">{allocation.display}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--fg-muted)]">USD denominations</span>
          <span className="text-white font-medium">
            {plan.note_value_usd > 0
              ? `${plan.usd_notes_100} x $100 + ${plan.usd_notes_50} x $50`
              : "Not entered"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Exchange instructions</p>
        {plan.stops.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">No destination exchanges entered.</p>
        ) : plan.stops.map((stop, index) => (
          <div key={`${stop.destination}-${index}`} className="border-b border-[var(--border)] last:border-0 pb-2 last:pb-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white font-medium">{stop.destination}</span>
              <RateBadge stop={stop} />
              <span className="ml-auto text-white">{formatUSD(stop.usd_amount)}</span>
            </div>
            <p className="text-[10px] text-[var(--fg-muted)] mt-1">
              {stop.rate_per_usd > 0 ? `1 USD = ${stop.rate_per_usd.toLocaleString("en-IN")} ${stop.currency}` : "Rate not entered"}
              {stop.rate_source ? ` · ${stop.rate_source}` : ""}
              {stop.rate_checked_at ? ` · checked ${stop.rate_checked_at}` : ""}
            </p>
            {stop.notes_cover_exchange && (
              <p className="text-[10px] text-indigo-300 mt-1">
                Use {stop.usd_notes_100} x $100{stop.usd_notes_50 > 0 ? ` + ${stop.usd_notes_50} x $50` : ""}
              </p>
            )}
          </div>
        ))}
      </div>

      {Math.abs(plan.projected_saving_inr) >= 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--fg-muted)]">
            <Landmark className="w-3.5 h-3.5" /> Projected FX saving
          </span>
          <span className={plan.projected_saving_inr >= 0 ? "text-emerald-300 font-semibold" : "text-rose-300 font-semibold"}>
            {plan.projected_saving_inr >= 0 ? "+" : "-"}{formatINR(Math.abs(plan.projected_saving_inr))}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {plan.notices.map((notice, index) => (
          <div key={`${notice.text}-${index}`} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]", noticeStyle[notice.tone])}>
            <NoticeIcon tone={notice.tone} />
            <span>{notice.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-l-2 border-white/10 pl-2.5 py-1">
      <p className="text-[9px] uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
      <p className={cn("text-sm font-semibold mt-0.5", accent ? "text-emerald-300" : "text-white")}>{value}</p>
    </div>
  );
}