import type { Metadata } from "next";
import { HotelFinder } from "@/components/hotels/HotelFinder";

export const metadata: Metadata = {
  title: "Hotel Finder",
  description: "Find hotel prices from Booking.com, Agoda, and MakeMyTrip for any city and travel date.",
  openGraph: { title: "Hotel Finder | TripMind", description: "Compare hotel prices from Booking.com, Agoda, and MakeMyTrip." },
};

export default function HotelsPage() { return <HotelFinder />; }
