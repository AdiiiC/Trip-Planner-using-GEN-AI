"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PlannerPdfButton({ city, days, travelDate, itinerary }: { city: string; days: number; travelDate: string; itinerary: string }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { generatePlannerPdfBlob } = await import("./PlannerPdf");
      const blob = await generatePlannerPdfBlob({ city, days, travelDate, itinerary });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(city || "trip-itinerary").replace(/[^\w-]+/g, "_")}_itinerary.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Itinerary PDF downloaded");
    } catch (error) {
      toast.error(`Could not generate PDF: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={download} disabled={busy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 text-[var(--fg-muted)] hover:text-white hover:border-white/20 transition-colors disabled:opacity-60">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      {busy ? "Preparing…" : "PDF"}
    </button>
  );
}
