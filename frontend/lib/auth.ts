"use client";

// Auth + saved-plan sync client. Bearer token kept in localStorage; the budget
// form's saved plans live on the server once you're logged in.

import { create } from "zustand";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : "http://localhost:8000");

const TOKEN_KEY = "wayfare:auth:token";

export interface AuthUser {
  id: number;
  email: string;
  /** Chosen handle, or null if this account hasn't picked one yet. */
  username: string | null;
  /** What the UI prints — the handle, else the email's local part. */
  display_name: string;
  is_2fa_enabled: boolean;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
  reason: string | null;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Mirrors backend/usernames.py so the form can fail fast without a round-trip. */
export function checkUsernameFormat(raw: string): string | null {
  const handle = raw.trim();
  if (handle.length < USERNAME_MIN || handle.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters`;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(handle))
    return "Start with a letter; use only letters, numbers and underscores";
  if (handle.endsWith("_") || handle.includes("__"))
    return "Underscores can't be doubled or come last";
  return null;
}

export interface ServerPlan {
  id: number;
  name: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function writeToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

async function req<T>(path: string, opts: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as Record<string, string>) };
  if (auth) {
    const t = readToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? res.statusText);
  return data as T;
}

// ── raw API ───────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string, username?: string) =>
    req<{ access_token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, username: username?.trim() || null }),
    }),
  login: (email: string, password: string) =>
    req<{ mfa_required?: boolean; mfa_token?: string; access_token?: string }>(
      "/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  login2fa: (mfa_token: string, code: string) =>
    req<{ access_token: string }>("/api/auth/login/2fa", { method: "POST", body: JSON.stringify({ mfa_token, code }) }),
  me: () => req<AuthUser>("/api/auth/me", {}, true),
  setUsername: (username: string) =>
    req<AuthUser>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ username }) }, true),
  usernameAvailable: (username: string) =>
    req<UsernameAvailability>(`/api/auth/username-available?u=${encodeURIComponent(username)}`),
  setup2fa: () => req<{ secret: string; otpauth_uri: string }>("/api/auth/2fa/setup", { method: "POST" }, true),
  enable2fa: (code: string) =>
    req<{ recovery_codes: string[] }>("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }, true),
  disable2fa: (code: string) =>
    req<void>("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }, true),
};

export const plansApi = {
  list: () => req<ServerPlan[]>("/api/plans", {}, true),
  create: (name: string, payload: Record<string, unknown>) =>
    req<ServerPlan>("/api/plans", { method: "POST", body: JSON.stringify({ name, payload }) }, true),
  update: (id: number, name: string, payload: Record<string, unknown>) =>
    req<ServerPlan>(`/api/plans/${id}`, { method: "PUT", body: JSON.stringify({ name, payload }) }, true),
  remove: (id: number) => req<void>(`/api/plans/${id}`, { method: "DELETE" }, true),
};

// ── auth store ────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "authed" | "anon";
  hydrate: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  hydrate: async () => {
    if (!readToken()) { set({ status: "anon", user: null }); return; }
    try {
      const user = await authApi.me();
      set({ user, status: "authed" });
    } catch {
      writeToken(null);
      set({ user: null, status: "anon" });
    }
  },
  setToken: async (token: string) => {
    writeToken(token);
    try {
      const user = await authApi.me();
      set({ user, status: "authed" });
    } catch {
      set({ status: "authed" });
    }
  },
  refreshUser: async () => {
    try { set({ user: await authApi.me() }); } catch { /* ignore */ }
  },
  logout: () => { writeToken(null); set({ user: null, status: "anon" }); },
}));

export function isLoggedIn(): boolean {
  return !!readToken();
}
