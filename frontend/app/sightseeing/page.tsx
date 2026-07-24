import type { Metadata } from "next";
import { SightseeingExplorer } from "@/components/sightseeing/SightseeingExplorer";

export const metadata: Metadata = {
  title: "Sightseeing Explorer",
  description: "Discover top tourist attractions, entry fees, and day trips near any destination worldwide.",
  openGraph: { title: "Sightseeing Explorer | TripMind", description: "Discover top attractions and day trips near any city." },
};

export default function SightseeingPage() {
  return <SightseeingExplorer />;
}
