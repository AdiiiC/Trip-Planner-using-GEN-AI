import type { Metadata } from "next";
import { FlightTracker } from "@/components/flights/FlightTracker";

export const metadata: Metadata = {
  title: "Flight Price Tracker",
  description: "Search one-way flight prices with check-in baggage from Skyscanner. Compare fares for any route.",
  openGraph: { title: "Flight Price Tracker | TripMind", description: "Search one-way flight prices from Skyscanner for any route." },
};

export default function FlightsPage() { return <FlightTracker />; }
