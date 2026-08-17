"use client";

// Landing page for the emailed password-reset link. No auto-login: proving you
// can read the inbox sets the password, logging in is a separate step.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { ApiError, authApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ForgotPasswordCard } from "../ForgotPasswordCard";

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="font-display text-4xl tracking-tight mb-2">New password</h1>
      <p className="text-[var(--fg-muted)] mb-8">Choose a password for your Wayfare account.</p>
      {/* useSearchParams needs a boundary or the static build bails out. */}
      <Suspense fallback={<div className="glass rounded-2xl p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--fg-muted)]" />
      </div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [deadLink, setDeadLink] = useState(!token);

  const problem =
    password && password.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters`
    : confirm && confirm !== password ? "Both passwords must match"
    : null;

  const submit = async () => {
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      // A rejected token is spent, expired or forged — all need a new email
      // rather than another attempt. Anything else is worth showing as-is.
      if (e instanceof ApiError && e.status === 400) setDeadLink(true);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="glass rounded-2xl p-6 space-y-4">
        <p className="flex items-center gap-2 font-medium">
          <CircleCheck className="w-5 h-5 text-emerald-400" /> Password updated
        </p>
        <p className="text-sm text-[var(--fg-muted)]">
          Every other device has been signed out. Log in with your new password to carry on.
        </p>
        <Button asChild className="w-full"><Link href="/account">Go to log in</Link></Button>
      </div>
    );
  }

  if (deadLink) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl p-6 space-y-2">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="w-5 h-5 text-amber-400" /> This link no longer works
          </p>
          <p className="text-sm text-[var(--fg-muted)]">
            Reset links expire after an hour and can only be used once. Send yourself a fresh one.
          </p>
        </div>
        <ForgotPasswordCard />
      </div>
    );
  }

  const blocked = busy || !!problem || password.length < MIN_LENGTH || confirm !== password;

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="space-y-2">
        <input className="input-dark" type="password" placeholder={`New password (min ${MIN_LENGTH} chars)`}
          value={password} autoFocus autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)} />
        <input className="input-dark" type="password" placeholder="Repeat new password"
          value={confirm} autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !blocked) submit(); }} />
        {problem && <p className="text-xs text-red-400">{problem}</p>}
      </div>
      <Button className="w-full" onClick={submit} disabled={blocked}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set password"}
      </Button>
    </div>
  );
}
