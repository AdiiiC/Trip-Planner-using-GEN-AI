"use client";

// Shared by the login form and the "this link expired" state of /account/reset.

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { authApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/** Asks for an address and says the same thing whether or not it's registered. */
export function ForgotPasswordCard({
  initialEmail = "", onBack,
}: { initialEmail?: string; onBack?: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to log in
        </button>
      )}
      {sent ? (
        <p className="text-sm text-[var(--fg-muted)]">
          If that address has an account, a reset link is on its way. It works once and
          expires in an hour.
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--fg-muted)]">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
          <input className="input-dark" type="email" placeholder="Email" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && submit()}
            autoComplete="email" />
          <Button className="w-full" onClick={submit} disabled={busy || !email}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
          </Button>
        </>
      )}
    </div>
  );
}
