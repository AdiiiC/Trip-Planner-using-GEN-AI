"use client";

// Server-side saved plans. Separate from the auth client so plan features can grow
// without touching sign-in code; both share the bearer token via ./authToken.

import { authHeader } from "./authToken";
import { API_BASE_URL as BASE } from "./config";

export interface ServerPlan {
  id: number;
  name: string;
  payload: Record<string, unknown>;
  /** Last computed result, when the plan was saved after a calculation. */
  result: Record<string, unknown> | null;
  total_inr: number | null;
  nights: number | null;
  version_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServerPlanVersion {
  id: number;
  payload: Record<string, unknown>;
  total_inr: number | null;
  created_at: string;
}

export interface PlanBody {
  name: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  total_inr?: number | null;
  nights?: number | null;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeader(), ...(opts.headers as Record<string, string>) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const plansApi = {
  list: () => req<ServerPlan[]>("/api/plans"),
  create: (body: PlanBody) => req<ServerPlan>("/api/plans", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: PlanBody) =>
    req<ServerPlan>(`/api/plans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id: number) => req<void>(`/api/plans/${id}`, { method: "DELETE" }),
  versions: (id: number) => req<ServerPlanVersion[]>(`/api/plans/${id}/versions`),
  restore: (id: number, versionId: number) =>
    req<ServerPlan>(`/api/plans/${id}/restore/${versionId}`, { method: "POST" }),
};
