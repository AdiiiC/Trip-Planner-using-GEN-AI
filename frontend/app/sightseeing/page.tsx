import type { Metadata } from "next";
import { SightseeingExplorer } from "@/components/sightseeing/SightseeingExplorer";
import { BestTimeWidget } from "@/components/ui/BestTimeWidget";

export const metadata: Metadata = {
  title: "Sightseeing Explorer",
  description: "Discover top tourist attractions, entry fees, and day trips near any destination worldwide.",
  openGraph: { title: "Sightseeing Explorer | TripMind", description: "Discover top attractions and day trips near any city." },
};

export default function SightseeingPage() {
  return (
    <>
      <SightseeingExplorer />
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <BestTimeWidget />
      </div>
    </>
  );
}
