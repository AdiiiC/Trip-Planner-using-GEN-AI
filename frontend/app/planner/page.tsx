import type { Metadata } from "next";
import { TripPlanner } from "@/components/planner/TripPlanner";

export const metadata: Metadata = {
  title: "AI Itinerary Planner",
  description:
    "Generate day-by-day AI travel itineraries streamed live. Supports multi-city trips, packing lists, visa info, and insurance estimates.",
  openGraph: { title: "AI Itinerary Planner | TripMind", description: "Generate streaming itineraries for any destination with AI." },
};

export default function PlannerPage() {
  return <TripPlanner />;
}
