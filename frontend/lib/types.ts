// ─── Budget types ─────────────────────────────────────────────────────────────

export interface ExchangeRate {
  currency: string;
  rate_to_inr: number;
}

export interface FlightCost {
  route: string;
  price_inr: number;
  per_person: boolean;
  date?: string;
}

export interface AccommodationCost {
  destination: string;
  total_cost_inr: number;
  split_type: "individual" | "group";
}

export interface ItemCost {
  name: string;
  destination: string;
  amount: number;
  currency: string;
}

export interface CashConversion {
  currency: string;
  amount_inr: number;
}

export interface BudgetInput {
  travelers: number;
  exchange_rates: ExchangeRate[];
  flights: FlightCost[];
  accommodations: AccommodationCost[];
  sightseeing: ItemCost[];
  extras: ItemCost[];
  pocket_money_usd: number;
  cash_conversions: CashConversion[];
}

export interface BudgetResult {
  travelers: number;
  fixed_costs: {
    flights: { items: FlightItem[]; total_inr: number };
    stays: { items: StayItem[]; total_inr: number };
    sightseeing: { items: SightItem[]; total_inr: number };
    extras: { items: ExtraItem[]; total_inr: number };
    total_inr: number;
    total_usd: number;
  };
  cash_conversion: {
    pocket_money_usd: number;
    pocket_money_inr: number;
    allocations: CashItem[];
    total_cash_out_inr: number;
    usd_forex_remaining_inr: number;
    usd_forex_remaining_usd: number;
  };
  grand_total: {
    inr: number;
    usd: number;
  };
  rates_used: Record<string, number>;
}

export interface FlightItem {
  route: string;
  amount_inr: number;
  date?: string;
}

export interface StayItem {
  destination: string;
  booking_total_inr: number;
  per_person_inr: number;
  split: string;
}

export interface SightItem {
  destination: string;
  name: string;
  original: string;
  amount_inr: number;
}

export interface ExtraItem {
  name: string;
  destination: string;
  original: string;
  amount_inr: number;
}

export interface CashItem {
  currency: string;
  inr_spent: number;
  foreign_amount: number;
  display: string;
}

// ─── Planner types ────────────────────────────────────────────────────────────

export interface PlanInput {
  city: string;
  days: number;
  interests: string[];
  budget: string;
  travel_style: string;
  dietary: string;
  travel_date: string;
  currency: string;
}

export interface RefineInput {
  itinerary: string;
  feedback: string;
}

export interface PackingInput {
  city: string;
  days: number;
  travel_style: string;
  interests: string[];
  travel_date: string;
}

export interface VisaInput {
  destination: string;
}

// ─── Sightseeing types ────────────────────────────────────────────────────────

export interface Attraction {
  name: string;
  description: string;
  category: string;
  entry_cost: string;
  entry_cost_usd: number | null;
  time_needed: string;
  location: string;
  tips: string;
}

export interface NearbyPlace {
  name: string;
  distance_km: string;
  travel_time: string;
  highlights: string;
  entry_cost: string;
  how_to_get: string;
}

export interface SightseeingResult {
  city: string;
  attractions: Attraction[];
  nearby_places: NearbyPlace[];
  sources: string[];
}

// ─── Flights types ────────────────────────────────────────────────────────────

export interface FlightSearchInput {
  origin: string;
  destination: string;
  date: string;
  passengers: number;
}

export interface FlightResult {
  airline: string;
  flight_number: string | null;
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  price_inr: number;
  baggage: string;
  source: string;
}

export interface FlightSearchResult {
  route: string;
  date: string;
  type: string;
  baggage_filter: string;
  results: FlightResult[];
  cheapest_inr: number;
  note: string;
  sources: string[];
}

// ─── Hotels types ─────────────────────────────────────────────────────────────

export interface HotelSearchInput {
  city: string;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: number;
  budget_tier: string;
}

export interface HotelResult {
  name: string;
  stars: number;
  area: string;
  price_per_night_inr: number;
  total_inr: number;
  rating: string;
  highlights: string[];
  source: string;
  url: string | null;
}

export interface HotelSearchResult {
  city: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  results: HotelResult[];
  cheapest_per_night_inr: number;
  note: string;
  sources: string[];
}

// ─── Restaurants types ────────────────────────────────────────────────────────

export interface RestaurantInput {
  city: string;
  cuisine: string;
  budget: string;
}

export interface Restaurant {
  name: string;
  cuisine: string;
  area: string;
  price_range: string;
  price_tier: string;
  rating: string;
  must_try: string[];
  hours: string | null;
  tips: string;
}

export interface RestaurantResult {
  city: string;
  cuisine_filter: string;
  budget_filter: string;
  restaurants: Restaurant[];
  sources: string[];
}

// ─── Insurance types ──────────────────────────────────────────────────────────

export interface InsuranceInput {
  destination: string;
  trip_cost_usd: number;
  duration_days: number;
  travelers: number;
  traveler_age: number;
}

// ─── Weather types ────────────────────────────────────────────────────────────

export interface WeatherInput {
  city: string;
  date?: string;
}

export interface WeatherDay {
  date: string;
  max_c: number;
  min_c: number;
  description: string;
  sunrise: string;
  sunset: string;
}

export interface WeatherResult {
  city: string;
  country: string;
  date: string;
  current: {
    temp_c: number;
    temp_f: number;
    feels_like_c: number;
    humidity: string;
    visibility_km: string;
    wind_kmph: string;
    description: string;
  };
  forecast: WeatherDay[];
  error?: string;
}

// ─── Multi-city types ─────────────────────────────────────────────────────────

export interface CityStop {
  city: string;
  days: number;
  date: string;
  notes: string;
}

export interface MultiCityInput {
  stops: CityStop[];
  interests: string[];
  budget: string;
  travel_style: string;
  dietary: string;
  currency: string;
}

// ─── Visa Check types ─────────────────────────────────────────────────────────

export type VisaType =
  | "visa_free"
  | "arrival_card"
  | "evisa"
  | "voa"
  | "evisa_or_voa"
  | "consulate"
  | "unknown";

export interface VisaCheckInput {
  country: string;
  passport_nationality?: string;
}

export interface VisaCheckResult {
  country: string;
  passport_nationality: string;
  visa_type: VisaType;
  is_free: boolean;
  cost_usd: number;
  cost_inr_approx: number;
  processing_time: string;
  validity: string;
  max_stay_days: number;
  apply_url: string | null;
  required_documents: string[];
  arrival_card_info: string | null;
  step_by_step: string[];
  important_notes: string;
  budget_line_item: string;
  verified_note: string;
  sources: string[];
}

// ─── Trip history types ───────────────────────────────────────────────────────

export interface SavedTrip {
  id: string;
  title: string;
  itinerary: string;
  city: string;
  days: number;
  savedAt: string;
}
