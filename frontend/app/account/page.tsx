"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ShieldCheck, LogOut, Loader2, Copy, AtSign, Check, X, Pencil } from "lucide-react";
import { useAuth, authApi, checkUsernameFormat, USERNAME_MAX, type AuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type Mode = "login" | "signup";

export default function AccountPage() {
  const { user, status, setToken, logout, refreshUser } = useAuth();

  if (status === "loading") {
    return <Centered><Loader2 className="w-5 h-5 animate-spin text-[var(--fg-muted)]" /></Centered>;
  }
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="font-display text-4xl tracking-tight mb-2">Account</h1>
      <p className="text-[var(--fg-muted)] mb-8">
        Log in to sync your saved budget plans across devices.
      </p>
      {user ? (
        <LoggedIn user={user} onLogout={logout} onChanged={refreshUser} />
      ) : (
        <AuthForms onToken={setToken} />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[40vh] flex items-center justify-center">{children}</div>;
}

// ── logged-out: login / signup ────────────────────────────────────────────────

function AuthForms({ onToken }: { onToken: (t: string) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleState = useUsernameCheck(mode === "signup" ? username : "");
  const handleBlocked = mode === "signup" && (handleState.status === "invalid" || handleState.status === "taken");

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { access_token } = await authApi.register(email, password, username);
        await onToken(access_token);
        toast.success("Account created");
      } else {
        const res = await authApi.login(email, password);
        if (res.mfa_required && res.mfa_token) { setMfaToken(res.mfa_token); return; }
        if (res.access_token) { await onToken(res.access_token); toast.success("Logged in"); }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async () => {
    if (!mfaToken) return;
    setBusy(true);
    try {
      const { access_token } = await authApi.login2fa(mfaToken, code);
      await onToken(access_token);
      toast.success("Logged in");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (mfaToken) {
    return (
      <div className="glass rounded-2xl p-6 space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">Enter the 6-digit code from your authenticator app (or a recovery code).</p>
        <input className="input-dark tracking-widest text-center" placeholder="000000" value={code}
          onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitMfa()} autoFocus />
        <Button className="w-full" onClick={submitMfa} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
        </Button>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex gap-2 text-sm">
        <button className={tab(mode === "login")} onClick={() => setMode("login")}>Log in</button>
        <button className={tab(mode === "signup")} onClick={() => setMode("signup")}>Sign up</button>
      </div>
      <div className="space-y-2">
        <input className="input-dark" type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode === "signup" && (
          <UsernameField
            value={username}
            onChange={setUsername}
            state={handleState}
            onEnter={submit}
            hint="Shown across Wayfare instead of your email. Optional — you can pick one later."
          />
        )}
        <input className="input-dark" type="password"
          placeholder={mode === "signup" ? "Password (min 8 chars)" : "Password"} value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy || !email || !password || handleBlocked}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signup" ? "Create account" : "Log in"}
      </Button>
    </div>
  );
}

// ── username field + availability check ───────────────────────────────────────

type HandleStatus = "idle" | "checking" | "ok" | "taken" | "invalid";
interface HandleState { status: HandleStatus; message: string | null }

/** Debounced availability lookup, with the format rules checked locally first. */
function useUsernameCheck(value: string, currentUsername?: string | null): HandleState {
  const handle = value.trim();
  const isCurrent = !!currentUsername && handle.toLowerCase() === currentUsername.toLowerCase();
  const formatError = handle && !isCurrent ? checkUsernameFormat(handle) : null;
  const shouldAsk = !!handle && !isCurrent && !formatError;

  // Keyed by handle so a stale answer never labels a newer input.
  const [answer, setAnswer] = useState<{ handle: string; state: HandleState } | null>(null);

  useEffect(() => {
    if (!shouldAsk) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const res = await authApi.usernameAvailable(handle);
        if (!alive) return;
        setAnswer({
          handle,
          state: res.available
            ? { status: "ok", message: `${res.username} is available` }
            : { status: "taken", message: res.reason ?? "That username is taken" },
        });
      } catch {
        // Offline or rate-limited — stay quiet and let submit be the judge.
        if (alive) setAnswer({ handle, state: { status: "idle", message: null } });
      }
    }, 450);

    return () => { alive = false; clearTimeout(timer); };
  }, [handle, shouldAsk]);

  if (!handle) return { status: "idle", message: null };
  if (isCurrent) return { status: "ok", message: "This is your current username" };
  if (formatError) return { status: "invalid", message: formatError };
  if (answer?.handle === handle) return answer.state;
  return { status: "checking", message: null };
}

function UsernameField({
  value, onChange, state, hint, autoFocus, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  state: HandleState;
  hint?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const tone =
    state.status === "ok" ? "text-emerald-400" :
    state.status === "checking" ? "text-[var(--fg-muted)]" :
    "text-red-400";

  return (
    <div className="space-y-1">
      <div className="relative">
        <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
        <input
          className="input-dark pl-9"
          placeholder="Username"
          value={value}
          maxLength={USERNAME_MAX}
          autoFocus={autoFocus}
          autoComplete="username"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {state.status === "checking" && <Loader2 className="w-4 h-4 animate-spin text-[var(--fg-muted)]" />}
          {state.status === "ok" && <Check className="w-4 h-4 text-emerald-400" />}
          {(state.status === "taken" || state.status === "invalid") && <X className="w-4 h-4 text-red-400" />}
        </span>
      </div>
      {state.message
        ? <p className={`text-xs ${tone}`}>{state.message}</p>
        : hint && <p className="text-xs text-[var(--fg-muted)]">{hint}</p>}
    </div>
  );
}

// ── logged-in: profile + 2FA ──────────────────────────────────────────────────

function LoggedIn({
  user, onLogout, onChanged,
}: { user: AuthUser; onLogout: () => void; onChanged: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-semibold">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">
              {user.username ? `@${user.username}` : user.display_name}
            </p>
            <p className="text-xs text-[var(--fg-muted)] truncate">{user.email}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-1.5" /> Log out
          </Button>
        </div>
        <UsernameSettings user={user} onChanged={onChanged} />
      </div>
      <TwoFactor enabled={user.is_2fa_enabled} onChanged={onChanged} />
    </div>
  );
}

function UsernameSettings({ user, onChanged }: { user: AuthUser; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(!user.username);
  const [value, setValue] = useState(user.username ?? "");
  const [busy, setBusy] = useState(false);
  const state = useUsernameCheck(editing ? value : "", user.username);

  const save = async () => {
    setBusy(true);
    try {
      await authApi.setUsername(value.trim());
      await onChanged();
      setEditing(false);
      toast.success("Username updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(user.username ?? ""); setEditing(true); }}
        className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" /> Change username
      </button>
    );
  }

  const unchanged = value.trim().toLowerCase() === (user.username ?? "").toLowerCase();
  const blocked = busy || unchanged || state.status !== "ok";

  return (
    <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
      {!user.username && (
        <p className="text-sm">
          <span className="font-medium">Pick a username.</span>{" "}
          <span className="text-[var(--fg-muted)]">
            It replaces your email everywhere in the app, so you&apos;re not showing your
            address on shared plans.
          </span>
        </p>
      )}
      <UsernameField
        value={value}
        onChange={setValue}
        state={state}
        autoFocus
        onEnter={() => { if (!blocked) save(); }}
        hint={`3-${USERNAME_MAX} characters: letters, numbers and underscores.`}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={blocked}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : user.username ? "Save" : "Set username"}
        </Button>
        {user.username && (
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function TwoFactor({ enabled, onChanged }: { enabled: boolean; onChanged: () => Promise<void> }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true);
    try {
      const { secret, otpauth_uri } = await authApi.setup2fa();
      setSetup({ secret, uri: otpauth_uri });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const { recovery_codes } = await authApi.enable2fa(code);
      setRecovery(recovery_codes);
      setSetup(null);
      setCode("");
      await onChanged();
      toast.success("Two-factor authentication enabled");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await authApi.disable2fa(code);
      setCode("");
      await onChanged();
      toast.success("Two-factor authentication disabled");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className={enabled ? "w-5 h-5 text-emerald-400" : "w-5 h-5 text-[var(--fg-muted)]"} />
        <p className="font-semibold">Two-factor authentication</p>
        <span className={`ml-auto text-xs ${enabled ? "text-emerald-400" : "text-[var(--fg-muted)]"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>

      {recovery && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-300">Save your recovery codes</p>
          <p className="text-xs text-[var(--fg-muted)]">Each works once if you lose your authenticator. Store them somewhere safe.</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm">
            {recovery.map((c) => <span key={c}>{c}</span>)}
          </div>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(recovery.join("\n")); toast.success("Copied"); }}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy all
          </Button>
        </div>
      )}

      {!enabled && !setup && (
        <Button onClick={begin} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable 2FA"}
        </Button>
      )}

      {!enabled && setup && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--fg-muted)]">Scan with Google Authenticator / Authy, then enter the 6-digit code.</p>
          <div className="bg-white p-3 rounded-lg w-fit"><QRCodeSVG value={setup.uri} size={160} /></div>
          <p className="text-xs text-[var(--fg-muted)]">Manual key: <span className="font-mono">{setup.secret}</span></p>
          <input className="input-dark tracking-widest text-center" placeholder="000000" value={code}
            onChange={(e) => setCode(e.target.value)} />
          <Button onClick={enable} disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & enable"}
          </Button>
        </div>
      )}

      {enabled && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--fg-muted)]">Enter a current code or recovery code to turn off 2FA.</p>
          <input className="input-dark tracking-widest text-center" placeholder="000000" value={code}
            onChange={(e) => setCode(e.target.value)} />
          <Button variant="outline" onClick={disable} disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disable 2FA"}
          </Button>
        </div>
      )}
    </div>
  );
}

function tab(active: boolean) {
  return `px-3 py-1.5 rounded-lg font-medium transition-colors ${
    active ? "bg-[var(--accent)] text-black" : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
  }`;
}
