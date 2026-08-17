"use client";

// Landing page for the emailed confirmation link. Verification is a nudge, not
// a gate, so a failure here costs the visitor nothing but the badge.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { authApi, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="font-display text-4xl tracking-tight mb-2">Email confirmation</h1>
      {/* useSearchParams needs a boundary or the static build bails out. */}
      <Suspense fallback={<Panel><Loader2 className="w-5 h-5 animate-spin text-[var(--fg-muted)]" /></Panel>}>
        <VerifyPanel />
      </Suspense>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-2xl p-6 space-y-4 mt-8">{children}</div>;
}

function VerifyPanel() {
  const token = useSearchParams().get("token") ?? "";
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    authApi.verifyEmail(token)
      .then(() => {
        if (!alive) return;
        setState("done");
        void refreshUser();  // drops the "not verified" row from the account card
      })
      .catch(() => { if (alive) setState("failed"); });
    return () => { alive = false; };
  }, [token, refreshUser]);

  if (state === "working") {
    return <Panel><Loader2 className="w-5 h-5 animate-spin text-[var(--fg-muted)]" /></Panel>;
  }

  if (state === "done") {
    return (
      <Panel>
        <p className="flex items-center gap-2 font-medium">
          <CircleCheck className="w-5 h-5 text-emerald-400" /> Address confirmed
        </p>
        <p className="text-sm text-[var(--fg-muted)]">Thanks — that&apos;s everything.</p>
        <Button asChild className="w-full"><Link href="/account">Back to your account</Link></Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="w-5 h-5 text-amber-400" /> This link no longer works
      </p>
      <p className="text-sm text-[var(--fg-muted)]">
        Confirmation links expire after 24 hours and can only be used once.
        {user ? " Send yourself a fresh one." : " Log in and we'll send you a fresh one."}
      </p>
      {user ? <Resend /> : <Button asChild className="w-full"><Link href="/account">Go to log in</Link></Button>}
    </Panel>
  );
}

function Resend() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      await authApi.requestVerification();
      setSent(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <p className="text-sm text-emerald-400">Sent — check your inbox.</p>;
  return (
    <Button className="w-full" onClick={resend} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send a new link"}
    </Button>
  );
}
