"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ShieldCheck, LogOut, Loader2, Copy } from "lucide-react";
import { useAuth, authApi } from "@/lib/auth";
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
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { access_token } = await authApi.register(email, password);
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
        <input className="input-dark" type="password"
          placeholder={mode === "signup" ? "Password (min 8 chars)" : "Password"} value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy || !email || !password}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signup" ? "Create account" : "Log in"}
      </Button>
    </div>
  );
}

// ── logged-in: profile + 2FA ──────────────────────────────────────────────────

function LoggedIn({
  user, onLogout, onChanged,
}: { user: { email: string; is_2fa_enabled: boolean }; onLogout: () => void; onChanged: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--fg-muted)]">Signed in as</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut className="w-4 h-4 mr-1.5" /> Log out
        </Button>
      </div>
      <TwoFactor enabled={user.is_2fa_enabled} onChanged={onChanged} />
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
