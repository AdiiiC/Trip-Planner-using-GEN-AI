"use client";

// Saved budget plans backed by the server when logged in, localStorage otherwise.
// On first login, any local plans are migrated up so nothing is lost.
//
// Server-side plans also carry the total they last computed to and an edit history;
// local plans keep the total (so the portfolio view still works logged out) but
// have no history, since that needs somewhere durable to put it.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { plansApi, type ServerPlanVersion } from "@/lib/plansClient";
import { loadPlans, savePlan, deletePlan, clearPlans, updatePlan } from "@/lib/budgetStorage";

export interface UIPlan {
  id: string;
  name: string;
  savedAt: number;
  values: Record<string, unknown>;
  /** Null when the plan was saved before it had ever been calculated. */
  totalINR: number | null;
  nights: number | null;
  versionCount: number;
}

export interface PlanSnapshot {
  name: string;
  values: Record<string, unknown>;
  totalINR: number | null;
  nights: number | null;
  result: Record<string, unknown> | null;
}

export function usePlans() {
  const status = useAuth((s) => s.status);
  const authed = status === "authed";
  const [plans, setPlans] = useState<UIPlan[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (authed) {
      const server = await plansApi.list();
      setPlans(server.map((p) => ({
        id: String(p.id),
        name: p.name,
        savedAt: Date.parse(p.updated_at),
        values: p.payload,
        totalINR: p.total_inr,
        nights: p.nights,
        versionCount: p.version_count,
      })));
    } else {
      setPlans(loadPlans<Record<string, unknown>>().map((p) => ({
        id: p.id,
        name: p.name,
        savedAt: p.savedAt,
        values: p.values,
        totalINR: p.totalINR ?? null,
        nights: p.nights ?? null,
        versionCount: 0,
      })));
    }
  }, [authed]);

  // Load on mount / auth change; migrate local plans to the server on first login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (authed) {
          const local = loadPlans<Record<string, unknown>>();
          if (local.length) {
            let allOk = true;
            for (const p of local) {
              try {
                await plansApi.create({
                  name: p.name, payload: p.values, total_inr: p.totalINR ?? null, nights: p.nights ?? null,
                });
              } catch { allOk = false; }
            }
            if (allOk) clearPlans();
          }
        }
        if (!cancelled) await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authed, refresh]);

  const save = useCallback(async (snap: PlanSnapshot) => {
    if (authed) {
      await plansApi.create({
        name: snap.name, payload: snap.values, result: snap.result,
        total_inr: snap.totalINR, nights: snap.nights,
      });
    } else {
      savePlan(snap.name, snap.values, { totalINR: snap.totalINR, nights: snap.nights });
    }
    await refresh();
  }, [authed, refresh]);

  /** Overwrite an existing plan. On the server this also snapshots the old state. */
  const update = useCallback(async (id: string, snap: PlanSnapshot) => {
    if (authed) {
      await plansApi.update(Number(id), {
        name: snap.name, payload: snap.values, result: snap.result,
        total_inr: snap.totalINR, nights: snap.nights,
      });
    } else {
      updatePlan(id, snap.name, snap.values, { totalINR: snap.totalINR, nights: snap.nights });
    }
    await refresh();
  }, [authed, refresh]);

  const remove = useCallback(async (id: string) => {
    if (authed) await plansApi.remove(Number(id));
    else deletePlan(id);
    await refresh();
  }, [authed, refresh]);

  const versions = useCallback(async (id: string): Promise<ServerPlanVersion[]> => {
    if (!authed) return [];
    return plansApi.versions(Number(id));
  }, [authed]);

  const restore = useCallback(async (id: string, versionId: number) => {
    const plan = await plansApi.restore(Number(id), versionId);
    await refresh();
    return plan;
  }, [refresh]);

  return { plans, save, update, remove, versions, restore, authed, loading };
}
