"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BudgetResult } from "@/lib/types";
import type { CashPlanSummary } from "@/lib/cashPlan";

export function BudgetPdfButton({
  result,
  cashPlan,
  title,
}: {
  result: BudgetResult;
  cashPlan?: CashPlanSummary;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const name = (title?.trim() || "Trip Budget");
      // Lazy-load the PDF renderer so it isn't in the initial bundle.
      const { generateBudgetPdfBlob } = await import("./BudgetPdf");
      const blob = await generateBudgetPdfBlob(result, name, cashPlan);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\w\-]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (e) {
      toast.error(`Could not generate PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] px-3 py-2 transition-colors disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      Download PDF
    </button>
  );
}
