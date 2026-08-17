"use client";

// The bearer token's storage key and accessors live here on their own so both the
// auth client and the general API client can reach the token without importing
// each other.

export const TOKEN_KEY = "wayfare:auth:token";

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function writeToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode / quota — treat as logged out */ }
}

/** `{ Authorization }` when signed in, otherwise empty so it can always be spread. */
export function authHeader(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
