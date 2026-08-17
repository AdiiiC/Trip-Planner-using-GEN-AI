"use client";

// Auth client: sign-in, the current-user store, and the account settings calls.
// Saved plans live in ./plansClient; the bearer token itself in ./authToken.

import { create } from "zustand";

import { readToken, writeToken } from "./authToken";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : "http://localhost:8000");

export interface AuthUser {
  id: number;
  email: string;
  /** Chosen handle, or null if this account hasn't picked one yet. */
  username: string | null;
  /** What the UI prints — the handle, else the email's local part. */
  display_name: string;
  is_2fa_enabled: boolean;
  /** Nothing is gated on this — the account card just nudges. */
  email_verified: boolean;
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

/** Carries the HTTP status so callers can tell "bad link" from "we're offline". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
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
  if (!res.ok) throw new ApiError((data as { detail?: string }).detail ?? res.statusText, res.status);
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
  /** Always resolves the same way, whether or not the address is registered. */
  forgotPassword: (email: string) =>
    req<{ detail: string }>("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    req<{ detail: string }>("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  /** Returns a replacement token — every other device is signed out. */
  changePassword: (current_password: string, new_password: string) =>
    req<{ access_token: string }>("/api/auth/password/change", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }, true),
  verifyEmail: (token: string) =>
    req<{ detail: string }>("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) }),
  requestVerification: () =>
    req<{ detail: string }>("/api/auth/email/verify/request", { method: "POST" }, true),
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
