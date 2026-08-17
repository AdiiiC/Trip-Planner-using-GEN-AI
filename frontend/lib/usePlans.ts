"use client";

// Saved budget plans backed by the server when logged in, localStorage otherwise.
// On first login, any local plans are migrated up so nothing is lost.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { plansApi } from "@/lib/auth";
import { loadPlans, savePlan, deletePlan, clearPlans } from "@/lib/budgetStorage";

export interface UIPlan {
  id: string;
  name: string;
  savedAt: number;
  values: Record<string, unknown>;
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
        id: String(p.id), name: p.name, savedAt: Date.parse(p.updated_at), values: p.payload,
      })));
    } else {
      setPlans(loadPlans<Record<string, unknown>>().map((p) => ({
        id: p.id, name: p.name, savedAt: p.savedAt, values: p.values,
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
              try { await plansApi.create(p.name, p.values); } catch { allOk = false; }
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

  const save = useCallback(async (name: string, values: Record<string, unknown>) => {
    if (authed) await plansApi.create(name, values);
    else savePlan(name, values);
    await refresh();
  }, [authed, refresh]);

  const remove = useCallback(async (id: string) => {
    if (authed) await plansApi.remove(Number(id));
    else deletePlan(id);
    await refresh();
  }, [authed, refresh]);

  return { plans, save, remove, authed, loading };
}
