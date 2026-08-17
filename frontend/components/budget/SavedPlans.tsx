"use client";

// Saved plans, as a portfolio: every plan shows what it costs, how it compares
// with the others, and (for server-side plans) what each past edit did to the
// total.

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, History, FolderOpen, Trash2, RefreshCw, RotateCcw, ArrowDownRight, ArrowUpRight, Minus,
} from "lucide-react";
import { usePlans, type UIPlan } from "@/lib/usePlans";
import type { ServerPlanVersion } from "@/lib/plansClient";
import { diffPlans, type DiffRow } from "@/lib/planDiff";
import type { BudgetResult } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";

interface Props {
  /** Reads the form's current values at click time, not render time. */
  getValues: () => Record<string, unknown>;
  /** The active case's result, so a saved plan remembers what it cost. */
  result: BudgetResult | null;
  onLoad: (values: Record<string, unknown>) => void;
  /** Owned by the parent because the PDF export titles itself with it. */
  name: string;
  onNameChange: (name: string) => void;
}

const dayStamp = (ms: number) => new Date(ms).toLocaleString(undefined, {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

/** Signed money with a matching arrow: red for costlier, green for cheaper. */
function Delta({ inr, className }: { inr: number; className?: string }) {
  if (Math.abs(inr) < 1) {
    return (
      <span className={cn("flex items-center gap-0.5 text-[var(--fg-muted)]", className)}>
        <Minus className="w-3 h-3" /> no change
      </span>
    );
  }
  const up = inr > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("flex items-center gap-0.5", up ? "text-rose-300" : "text-emerald-300", className)}>
      <Icon className="w-3 h-3 shrink-0" />
      {up ? "+" : "−"}{formatINR(Math.abs(inr))}
    </span>
  );
}

function DiffList({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[11px] text-[var(--fg-muted)]">Only the name changed.</p>;
  }
  return (
    <ul className="space-y-1">
      {rows.slice(0, 8).map((row, i) => (
        <li key={`${row.section}-${row.label}-${i}`} className="flex items-baseline gap-2 text-[11px]">
          <span className="text-[var(--fg-muted)] shrink-0">{row.section}</span>
          <span className="text-white truncate">{row.label}</span>
          {row.kind !== "changed" && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--fg-muted)] shrink-0">{row.kind}</span>
          )}
          <span className="ml-auto shrink-0">
            {row.deltaINR === 0
              ? <span className="text-[var(--fg-muted)]">—</span>
              : <Delta inr={row.deltaINR} />}
          </span>
        </li>
      ))}
      {rows.length > 8 && (
        <li className="text-[10px] text-[var(--fg-muted)]/70">+{rows.length - 8} more changes</li>
      )}
    </ul>
  );
}

/** History for one plan: each snapshot against the state that replaced it. */
function PlanHistory({ plan, versions, onRestore }: {
  plan: UIPlan;
  versions: ServerPlanVersion[];
  onRestore: (versionId: number) => void;
}) {
  if (versions.length === 0) {
    return <p className="text-[11px] text-[var(--fg-muted)] px-3 pb-2">No edits recorded yet.</p>;
  }
  return (
    <ul className="space-y-2 px-3 pb-3">
      {versions.map((version, i) => {
        // Snapshots are newest-first, so what replaced this one is the previous
        // entry — or the plan as it stands now for the most recent snapshot.
        const after = i === 0
          ? { payload: plan.values, total_inr: plan.totalINR }
          : { payload: versions[i - 1].payload, total_inr: versions[i - 1].total_inr };
        const { rows } = diffPlans(version.payload, after.payload);
        const totalDelta =
          version.total_inr != null && after.total_inr != null ? after.total_inr - version.total_inr : null;

        return (
          <li key={version.id} className="rounded-lg border border-[var(--border)] bg-black/20 p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--fg-muted)]">
                {i === 0 ? "Latest edit" : `Edit ${versions.length - i}`} · {dayStamp(Date.parse(version.created_at))}
              </span>
              <span className="ml-auto text-[11px]">
                {totalDelta != null ? <Delta inr={totalDelta} /> : <span className="text-[var(--fg-muted)]">—</span>}
              </span>
            </div>
            <DiffList rows={rows} />
            <button
              type="button"
              onClick={() => onRestore(version.id)}
              className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200"
            >
              <RotateCcw className="w-3 h-3" /> Restore this version
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SavedPlans({ getValues, result, onLoad, name: planName, onNameChange: setPlanName }: Props) {
  const { plans, save, update, remove, versions, restore, authed } = usePlans();
  // The plan the form is currently working on, so saving can overwrite it (and
  // record history) rather than piling up near-duplicates.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<ServerPlanVersion[]>([]);
  const [busy, setBusy] = useState(false);

  const snapshot = useCallback((name: string) => ({
    name,
    values: getValues(),
    result: (result as unknown as Record<string, unknown>) ?? null,
    totalINR: result?.grand_total.inr ?? null,
    nights: result?.trip?.nights ?? null,
  }), [getValues, result]);

  const activePlan = plans.find(p => p.id === activeId) ?? null;

  const saveNew = useCallback(async () => {
    setBusy(true);
    try {
      await save(snapshot(planName.trim() || new Date().toLocaleString()));
      setPlanName("");
      setActiveId(null);
    } finally { setBusy(false); }
  }, [planName, save, snapshot, setPlanName]);

  const saveOver = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true);
    try {
      await update(activePlan.id, snapshot(planName.trim() || activePlan.name));
      if (openHistory === activePlan.id) setHistory(await versions(activePlan.id));
    } finally { setBusy(false); }
  }, [activePlan, planName, update, snapshot, openHistory, versions]);

  const load = useCallback((plan: UIPlan) => {
    onLoad(plan.values);
    setActiveId(plan.id);
    setPlanName(plan.name);
  }, [onLoad, setPlanName]);

  const toggleHistory = useCallback(async (plan: UIPlan) => {
    if (openHistory === plan.id) { setOpenHistory(null); return; }
    setOpenHistory(plan.id);
    setHistory(await versions(plan.id));
  }, [openHistory, versions]);

  const onRestore = useCallback(async (plan: UIPlan, versionId: number) => {
    setBusy(true);
    try {
      const restored = await restore(plan.id, versionId);
      onLoad(restored.payload);
      setActiveId(plan.id);
      setHistory(await versions(plan.id));
    } finally { setBusy(false); }
  }, [restore, onLoad, versions]);

  // Portfolio scale: every bar is relative to the most expensive plan.
  const priced = plans.filter(p => p.totalINR != null);
  const dearest = Math.max(...priced.map(p => p.totalINR ?? 0), 1);
  const cheapest = priced.length > 1
    ? priced.reduce((min, p) => ((p.totalINR ?? 0) < (min.totalINR ?? 0) ? p : min), priced[0])
    : null;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="text"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void (activePlan ? saveOver() : saveNew()); } }}
          placeholder="Name this plan (e.g. SEA trip — Nov 2026)"
          className="input-dark flex-1"
        />
        {activePlan && (
          <button
            type="button"
            onClick={saveOver}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 px-3 py-2 transition-colors disabled:opacity-60"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            Update
          </button>
        )}
        <button
          type="button"
          onClick={saveNew}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border border-emerald-500/30 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20 px-3 py-2 transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {activePlan ? "Save as new" : "Save current"}
        </button>
      </div>

      {activePlan && (
        <p className="text-[11px] text-[var(--fg-muted)]">
          Editing <span className="text-white">{activePlan.name}</span> — Update overwrites it and keeps the old
          version in history.{" "}
          <button type="button" onClick={() => { setActiveId(null); setPlanName(""); }}
            className="underline hover:text-white">Stop editing</button>
        </p>
      )}

      {plans.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
          <History className="w-3.5 h-3.5" />
          {authed
            ? "Saved plans sync to your account — open them on any device."
            : "Saved in this browser. "}
          {!authed && (
            <a href="/account" className="text-emerald-400 hover:text-emerald-300 underline">Log in to sync across devices</a>
          )}
        </p>
      ) : (
        <>
          {priced.length > 1 && (
            <p className="text-[11px] text-[var(--fg-muted)]">
              {priced.length} priced plans ·{" "}
              <span className="text-emerald-300">{cheapest?.name}</span> is the cheapest at{" "}
              <span className="text-white">{formatINR(cheapest?.totalINR ?? 0)}</span>
            </p>
          )}
          <ul className="space-y-1.5">
            {plans.map((p) => (
              <li key={p.id} className={cn(
                "rounded-lg border bg-black/20 overflow-hidden",
                p.id === activeId ? "border-indigo-500/40" : "border-[var(--border)]"
              )}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm text-white">{p.name}</p>
                    <p className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1.5 flex-wrap">
                      {p.totalINR != null && <span className="text-white font-medium">{formatINR(p.totalINR)}</span>}
                      {p.nights ? <span>· {p.nights}n</span> : null}
                      {p.totalINR != null && p.nights
                        ? <span>· {formatINR(Math.round(p.totalINR / (p.nights + 1)))}/day</span>
                        : null}
                      <span>· {dayStamp(p.savedAt)}</span>
                    </p>
                    {p.totalINR != null && (
                      <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((p.totalINR / dearest) * 100, 100)}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className={cn("h-full rounded-full", p.id === cheapest?.id ? "bg-emerald-400" : "bg-indigo-400/70")}
                        />
                      </div>
                    )}
                  </div>
                  {p.versionCount > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleHistory(p)}
                      className="flex items-center gap-1 text-xs font-medium rounded-md border border-[var(--border)] text-[var(--fg-muted)] hover:text-white hover:border-white/20 px-2 py-1 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" /> {p.versionCount}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => load(p)}
                    className="flex items-center gap-1 text-xs font-medium rounded-md border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 px-2 py-1 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> Load
                  </button>
                  <button
                    type="button"
                    onClick={() => { void remove(p.id); if (activeId === p.id) setActiveId(null); }}
                    aria-label={`Delete ${p.name}`}
                    className="text-rose-400 hover:text-rose-300 p-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {openHistory === p.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-[var(--border)]"
                    >
                      <PlanHistory plan={p} versions={history} onRestore={(vid) => onRestore(p, vid)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
