// Local, browser-only persistence for Budget Calculator inputs so a trip's
// details can be saved once and reloaded instead of re-entered every visit.

export interface SavedBudgetPlan<T = unknown> {
  id: string;
  name: string;
  savedAt: number;
  values: T;
}

const KEY = "wayfare:budget:plans:v1";
const MAX_PLANS = 25;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPlans<T = unknown>(): SavedBudgetPlan<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedBudgetPlan<T>[]) : [];
  } catch {
    return [];
  }
}

function persist<T>(plans: SavedBudgetPlan<T>[]): SavedBudgetPlan<T>[] {
  if (typeof window === "undefined") return plans;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // storage full or blocked — keep the in-memory list usable regardless
  }
  return plans;
}

/** Save a new snapshot; newest first, capped at MAX_PLANS. */
export function savePlan<T>(name: string, values: T): SavedBudgetPlan<T>[] {
  const entry: SavedBudgetPlan<T> = {
    id: newId(),
    name: name.trim() || new Date().toLocaleString(),
    savedAt: Date.now(),
    values,
  };
  const next = [entry, ...loadPlans<T>()].slice(0, MAX_PLANS);
  return persist(next);
}

export function deletePlan<T = unknown>(id: string): SavedBudgetPlan<T>[] {
  return persist(loadPlans<T>().filter((p) => p.id !== id));
}

export function clearPlans(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function renamePlan<T = unknown>(id: string, name: string): SavedBudgetPlan<T>[] {
  const next = loadPlans<T>().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  return persist(next);
}
