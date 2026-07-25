"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import {
  Search, CheckCircle2, AlertTriangle, XCircle, Info,
  ExternalLink, Globe, Clock, Calendar, FileText,
  ChevronDown, ChevronUp, CreditCard, Plus, ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import type { VisaCheckResult, VisaType } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";

// ─── Visa type config ─────────────────────────────────────────────────────────

const VISA_CONFIG: Record<VisaType, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
  dot: string;
}> = {
  visa_free: {
    label: "Visa Free",
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
  },
  arrival_card: {
    label: "Visa Free — Arrival Card Required",
    color: "text-teal-300",
    bg: "bg-teal-500/15",
    border: "border-teal-500/30",
    icon: FileText,
    dot: "bg-teal-500",
  },
  evisa: {
    label: "e-Visa Required",
    color: "text-sky-300",
    bg: "bg-sky-500/15",
    border: "border-sky-500/30",
    icon: Globe,
    dot: "bg-sky-500",
  },
  voa: {
    label: "Visa on Arrival",
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    icon: CreditCard,
    dot: "bg-amber-500",
  },
  evisa_or_voa: {
    label: "e-Visa or Visa on Arrival",
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    icon: CreditCard,
    dot: "bg-amber-500",
  },
  consulate: {
    label: "Consulate / Embassy Visa",
    color: "text-rose-300",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
    icon: ShieldAlert,
    dot: "bg-rose-500",
  },
  unknown: {
    label: "Verify with Embassy",
    color: "text-[var(--fg-muted)]",
    bg: "bg-white/5",
    border: "border-white/10",
    icon: AlertTriangle,
    dot: "bg-slate-500",
  },
};

const POPULAR_COUNTRIES = [
  "Thailand", "Vietnam", "Malaysia", "Indonesia / Bali",
  "Singapore", "Sri Lanka", "Japan", "UAE / Dubai",
  "Turkey", "Cambodia", "USA", "UK", "Schengen / France",
  "Australia", "New Zealand", "Kenya", "Egypt", "Maldives",
];

// ─── Visa badge (reusable, used in BudgetCalculator too) ─────────────────────

export function VisaBadge({ type, small }: { type: VisaType; small?: boolean }) {
  const cfg = VISA_CONFIG[type] ?? VISA_CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-medium rounded-full border",
      cfg.bg, cfg.border, cfg.color,
      small ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
    )}>
      <Icon className={small ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} />
      {cfg.label}
    </span>
  );
}

// ─── VisaResultCard ───────────────────────────────────────────────────────────

export function VisaResultCard({
  result,
  onAddToBudget,
}: {
  result: VisaCheckResult;
  onAddToBudget?: (name: string, amount: number, currency: string) => void;
}) {
  const cfg = VISA_CONFIG[result.visa_type] ?? VISA_CONFIG.unknown;
  const [showSteps, setShowSteps] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass rounded-2xl overflow-hidden border", cfg.border)}
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between px-5 py-4", cfg.bg)}>
        <div className="flex items-center gap-3">
          <VisaBadge type={result.visa_type} />
          <span className="text-white font-semibold text-lg">{result.country}</span>
        </div>
        {result.is_free ? (
          <span className="text-emerald-400 font-bold text-lg">Free ✓</span>
        ) : (
          <div className="text-right">
            <p className="text-white font-bold text-xl">${result.cost_usd}</p>
            <p className="text-xs text-[var(--fg-muted)]">≈ {formatINR(result.cost_inr_approx)}</p>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatPill icon={Clock} label="Processing" value={result.processing_time || "—"} />
          <StatPill icon={Calendar} label="Validity" value={result.validity || "—"} />
          {result.max_stay_days > 0 && (
            <StatPill icon={Calendar} label="Max stay" value={`${result.max_stay_days} days`} />
          )}
        </div>

        {/* Arrival card alert */}
        {result.arrival_card_info && (
          <div className="flex items-start gap-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 p-3">
            <FileText className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-teal-300 mb-0.5">Arrival Card Required</p>
              <p className="text-xs text-teal-200/80">{result.arrival_card_info}</p>
            </div>
          </div>
        )}

        {/* Step-by-step toggle */}
        {result.step_by_step?.length > 0 && (
          <div>
            <button
              onClick={() => setShowSteps(o => !o)}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              What you need to do ({result.step_by_step.length} steps)
            </button>
            <AnimatePresence>
              {showSteps && (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  {result.step_by_step.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--fg-muted)]">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-300 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Required docs */}
        {result.required_documents?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-2">
              Documents needed
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.required_documents.map((doc, i) => (
                <span key={i}
                  className="text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5 text-[var(--fg-muted)]">
                  {doc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Important notes */}
        {result.important_notes && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/90">{result.important_notes}</p>
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex gap-2 flex-wrap">
            {result.apply_url && (
              <a
                href={result.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-1.5 transition-colors"
              >
                Apply Online <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {result.sources?.[0] && (
              <a
                href={result.sources[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--fg-muted)] hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
              >
                Source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Add to Budget button */}
          {!result.is_free && result.cost_usd > 0 && onAddToBudget && (
            <button
              onClick={() => onAddToBudget(
                result.budget_line_item || `${result.country} Visa`,
                result.cost_inr_approx,
                "INR"
              )}
              className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add {formatINR(result.cost_inr_approx)} to Budget
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-[var(--fg-muted)]/60 border-t border-white/5 pt-2">
          {result.verified_note}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Standalone page component ────────────────────────────────────────────────

export function VisaCostChecker({
  onAddToBudget,
}: {
  onAddToBudget?: (name: string, amount: number, currency: string) => void;
}) {
  const [country, setCountry] = useState("");
  const [result, setResult] = useState<VisaCheckResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.checkVisa({ country }),
    onSuccess: setResult,
  });

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="flex gap-2">
        <input
          value={country}
          onChange={e => setCountry(e.target.value)}
          onKeyDown={e => e.key === "Enter" && country.trim() && mutation.mutate()}
          placeholder="Country (e.g. Thailand, Vietnam, USA…)"
          className="input-dark flex-1"
        />
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !country.trim()}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-medium text-sm disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          {mutation.isPending ? "Checking…" : "Check Visa"}
        </button>
      </div>

      {/* Popular country chips */}
      <div className="flex flex-wrap gap-1.5">
        {POPULAR_COUNTRIES.map(c => (
          <button
            key={c}
            onClick={() => { setCountry(c); }}
            className="text-xs rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[var(--fg-muted)] hover:text-white transition-colors"
          >
            {c}
          </button>
        ))}
      </div>

      {/* Loading */}
      {mutation.isPending && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-[var(--fg-muted)] text-sm">Checking visa requirements for Indian passport…</p>
        </div>
      )}

      {/* Error */}
      {mutation.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          {mutation.error?.message ?? "Check failed. Is the backend running?"}
        </div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && !mutation.isPending && (
          <VisaResultCard result={result} onAddToBudget={onAddToBudget} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── helper ───────────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)] mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className="text-xs font-medium text-white">{value}</p>
    </div>
  );
}
