"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Activity, CalendarCheck, ChartNoAxesCombined, CircleDollarSign, Gauge, GitCompare, LoaderCircle, PlaneTakeoff, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";

type Mode = "readiness" | "scenarios" | "booking" | "destinations" | "feasibility" | "risk";
type JsonMap = Record<string, unknown>;
type CheckState = Record<"budget_ready" | "flights_booked" | "hotel_booked" | "visa_ready" | "itinerary_ready" | "insurance_ready", boolean>;
type CostState = Record<"Flights" | "Stays" | "Food" | "Activities", number>;
type BookingState = { name: string; kind: string; current_price: number; typical_low: number; typical_high: number; days_until_trip: number } & Record<string, string | number>;
type DestinationState = { name: string; daily_cost: number; weather: number; visa_ease: number; transit: number; interests: number; crowd_comfort: number } & Record<string, string | number>;
type DayState = { day: number; activities: number; activity_hours: number; travel_hours: number; meal_breaks: number } & Record<string, number>;

const MODES: { id: Mode; label: string; icon: typeof Gauge }[] = [
  { id: "readiness", label: "Readiness", icon: CalendarCheck },
  { id: "scenarios", label: "Scenarios", icon: GitCompare },
  { id: "booking", label: "Booking", icon: PlaneTakeoff },
  { id: "destinations", label: "Compare", icon: ChartNoAxesCombined },
  { id: "feasibility", label: "Pace", icon: Activity },
  { id: "risk", label: "Budget risk", icon: ShieldAlert },
];

const futureDate = () => {
  const value = new Date();
  value.setDate(value.getDate() + 60);
  return value.toISOString().slice(0, 10);
};

export function TravelIntelligence() {
  const [mode, setMode] = useState<Mode>("readiness");
  const [result, setResult] = useState<JsonMap | null>(null);
  const [departure, setDeparture] = useState(futureDate);
  const [checks, setChecks] = useState<CheckState>({ budget_ready: true, flights_booked: false, hotel_booked: false, visa_ready: true, itinerary_ready: false, insurance_ready: false });
  const [weatherRisk, setWeatherRisk] = useState("low");
  const [costs, setCosts] = useState<CostState>({ Flights: 52000, Stays: 32000, Food: 18000, Activities: 15000 });
  const [booking, setBooking] = useState<BookingState>({ name: "BLR to Singapore", kind: "flight", current_price: 22000, typical_low: 19000, typical_high: 31000, days_until_trip: 60 });
  const [destinations, setDestinations] = useState<DestinationState[]>([
    { name: "Singapore", daily_cost: 10500, weather: 72, visa_ease: 80, transit: 95, interests: 86, crowd_comfort: 62 },
    { name: "Kuala Lumpur", daily_cost: 6200, weather: 76, visa_ease: 90, transit: 82, interests: 80, crowd_comfort: 75 },
    { name: "Ho Chi Minh City", daily_cost: 4800, weather: 70, visa_ease: 74, transit: 70, interests: 92, crowd_comfort: 68 },
  ]);
  const [days, setDays] = useState<DayState[]>([
    { day: 1, activities: 4, activity_hours: 7, travel_hours: 2, meal_breaks: 2 },
    { day: 2, activities: 7, activity_hours: 9, travel_hours: 3.5, meal_breaks: 1 },
    { day: 3, activities: 3, activity_hours: 6, travel_hours: 1, meal_breaks: 2 },
  ]);
  const [uncertainty, setUncertainty] = useState(12);

  const mutation = useMutation({
    mutationFn: ({ kind, payload }: { kind: Mode; payload: unknown }) => api.intelligence<JsonMap>(kind, payload),
    onSuccess: response => setResult(response.result),
  });

  const payload = (): unknown => {
    const categories = Object.entries(costs).map(([name, amount]) => ({ name, amount, uncertainty_pct: uncertainty, exchange_exposed: name !== "Flights" }));
    if (mode === "readiness") return { departure_date: departure, ...checks, weather_risk: weatherRisk };
    if (mode === "scenarios") return { categories };
    if (mode === "booking") return { items: [booking] };
    if (mode === "destinations") return { destinations };
    if (mode === "feasibility") return { days };
    return { categories, currency_shock_pct: 8, contingency_pct: 10 };
  };

  const run = () => mutation.mutate({ kind: mode, payload: payload() });
  const changeMode = (next: Mode) => { setMode(next); setResult(null); };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 pb-16">
      <header className="mb-6 max-w-3xl">
        <p className="text-xs uppercase text-emerald-400 font-semibold mb-2">Decision workspace</p>
        <h1 className="font-display text-4xl md:text-5xl leading-none mb-3">Trip Intelligence</h1>
        <p className="text-[var(--fg-muted)]">Stress-test the plan before money or time gets locked in. Adjust assumptions, then read the shape of the decision instead of another wall of totals.</p>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] mb-6 scrollbar-hide">
        {MODES.map(item => <button key={item.id} onClick={() => changeMode(item.id)} className={cn(
          "h-11 px-3 shrink-0 flex items-center gap-2 text-sm border-b-2 transition-colors",
          mode === item.id ? "border-emerald-500 text-[var(--fg)]" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"
        )}><item.icon className="w-4 h-4" />{item.label}</button>)}
      </div>

      <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
        <section className="surface p-5">
          <InputPanel mode={mode} departure={departure} setDeparture={setDeparture} checks={checks} setChecks={setChecks}
            weatherRisk={weatherRisk} setWeatherRisk={setWeatherRisk} costs={costs} setCosts={setCosts}
            booking={booking} setBooking={setBooking} destinations={destinations} setDestinations={setDestinations}
            days={days} setDays={setDays} uncertainty={uncertainty} setUncertainty={setUncertainty} />
          <button onClick={run} disabled={mutation.isPending} className="mt-5 w-full h-10 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {mutation.isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />} Analyze plan
          </button>
        </section>

        <section className="surface min-h-[520px] p-5 md:p-6">
          {mutation.isError && <p className="text-rose-400 text-sm">{mutation.error.message}</p>}
          {!result ? <EmptyVisual mode={mode} /> : <ResultVisual mode={mode} result={result} />}
        </section>
      </div>
    </main>
  );
}

type InputProps = {
  mode: Mode; departure: string; setDeparture: (value: string) => void;
  checks: CheckState; setChecks: React.Dispatch<React.SetStateAction<CheckState>>;
  weatherRisk: string; setWeatherRisk: (value: string) => void;
  costs: CostState; setCosts: React.Dispatch<React.SetStateAction<CostState>>;
  booking: BookingState; setBooking: React.Dispatch<React.SetStateAction<BookingState>>;
  destinations: DestinationState[]; setDestinations: React.Dispatch<React.SetStateAction<DestinationState[]>>;
  days: DayState[]; setDays: React.Dispatch<React.SetStateAction<DayState[]>>;
  uncertainty: number; setUncertainty: (value: number) => void;
};

function InputPanel(props: InputProps) {
  const field = "input-dark h-10";
  if (props.mode === "readiness") return <div><PanelTitle>Departure readiness</PanelTitle><Label>Departure date</Label><input type="date" value={props.departure} onChange={event => props.setDeparture(event.target.value)} className={field} /><div className="grid grid-cols-2 gap-2 mt-4">{Object.entries(props.checks).map(([key, value]) => <label key={key} className="flex gap-2 items-center text-xs p-2 border border-[var(--border)] rounded-md"><input type="checkbox" checked={value} onChange={() => props.setChecks({ ...props.checks, [key]: !value })} />{key.replace("_ready", "").replace("_booked", "")}</label>)}</div><Label>Weather risk</Label><select value={props.weatherRisk} onChange={event => props.setWeatherRisk(event.target.value)} className={field}><option>low</option><option>medium</option><option>high</option></select></div>;
  if (props.mode === "booking") return <div><PanelTitle>Price position</PanelTitle>{Object.entries(props.booking).map(([key, value]) => key === "kind" ? <div key={key}><Label>Type</Label><select className={field} value={String(value)} onChange={event => props.setBooking({ ...props.booking, kind: event.target.value })}><option value="flight">Flight</option><option value="hotel">Hotel</option></select></div> : <div key={key}><Label>{key.replaceAll("_", " ")}</Label><input className={field} type={key === "name" ? "text" : "number"} value={value} onChange={event => props.setBooking({ ...props.booking, [key]: key === "name" ? event.target.value : Number(event.target.value) })} /></div>)}</div>;
  if (props.mode === "destinations") return <div><PanelTitle>Destination matrix</PanelTitle><p className="text-xs text-[var(--fg-muted)] mb-3">Edit names and daily cost; use sliders to tune weather and interest fit.</p>{props.destinations.map((destination, index) => <div key={index} className="border-t border-[var(--border)] pt-3 mt-3"><div className="grid grid-cols-[1fr_100px] gap-2"><input className={field} value={destination.name} onChange={event => updateList(props.destinations, props.setDestinations, index, "name", event.target.value)} /><input className={field} type="number" value={destination.daily_cost} onChange={event => updateList(props.destinations, props.setDestinations, index, "daily_cost", Number(event.target.value))} /></div><Label>Weather {destination.weather}</Label><input className="w-full accent-emerald-500" type="range" min="0" max="100" value={destination.weather} onChange={event => updateList(props.destinations, props.setDestinations, index, "weather", Number(event.target.value))} /><Label>Interest fit {destination.interests}</Label><input className="w-full accent-emerald-500" type="range" min="0" max="100" value={destination.interests} onChange={event => updateList(props.destinations, props.setDestinations, index, "interests", Number(event.target.value))} /></div>)}</div>;
  if (props.mode === "feasibility") return <div><PanelTitle>Daily pace</PanelTitle>{props.days.map((day, index) => <div key={index} className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 mt-3"><p className="col-span-2 text-xs font-semibold">Day {day.day}</p>{["activities", "activity_hours", "travel_hours", "meal_breaks"].map(key => <div key={key}><Label>{key.replaceAll("_", " ")}</Label><input type="number" step="0.5" className={field} value={day[key]} onChange={event => updateList(props.days, props.setDays, index, key, Number(event.target.value))} /></div>)}</div>)}</div>;
  return <div><PanelTitle>{props.mode === "risk" ? "Cost uncertainty" : "Scenario baseline"}</PanelTitle>{Object.entries(props.costs).map(([key, value]) => <div key={key}><Label>{key}</Label><input className={field} type="number" value={value} onChange={event => props.setCosts({ ...props.costs, [key]: Number(event.target.value) })} /></div>)}{props.mode === "risk" && <div><Label>Category uncertainty: {props.uncertainty}%</Label><input className="w-full accent-emerald-500" type="range" min="0" max="40" value={props.uncertainty} onChange={event => props.setUncertainty(Number(event.target.value))} /></div>}</div>;
}

function updateList<T extends Record<string, string | number>>(items: T[], setter: (items: T[]) => void, index: number, key: string, value: string | number) { setter(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)); }
function PanelTitle({ children }: { children: React.ReactNode }) { return <h2 className="font-semibold text-lg mb-4">{children}</h2>; }
function Label({ children }: { children: React.ReactNode }) { return <label className="block text-[11px] capitalize text-[var(--fg-muted)] mt-3 mb-1">{children}</label>; }

function EmptyVisual({ mode }: { mode: Mode }) {
  const copy = { readiness: "See what must happen before departure", scenarios: "Compare lean, balanced, and comfortable plans", booking: "Find where today's price sits in its normal range", destinations: "Rank destinations across cost and experience", feasibility: "Expose overpacked days before the trip", risk: "See the uncertainty hidden inside the total" }[mode];
  return <div className="min-h-[470px] grid place-items-center text-center"><div><CircleDollarSign className="w-14 h-14 mx-auto mb-4 text-emerald-400/60" strokeWidth={1.2} /><h2 className="font-display text-3xl mb-2">Make the tradeoff visible</h2><p className="text-sm text-[var(--fg-muted)] max-w-sm">{copy}. Adjust the assumptions, then analyze.</p></div></div>;
}

function ResultVisual({ mode, result }: { mode: Mode; result: JsonMap }) {
  if (mode === "readiness") return <ReadinessVisual data={result as unknown as ReadinessResult} />;
  if (mode === "scenarios") return <ScenarioVisual data={result as unknown as ScenarioResult} />;
  if (mode === "booking") return <BookingVisual data={result as unknown as BookingResult} />;
  if (mode === "destinations") return <DestinationVisual data={result as unknown as DestinationResult} />;
  if (mode === "feasibility") return <PaceVisual data={result as unknown as PaceResult} />;
  return <RiskVisual data={result as unknown as RiskResult} />;
}

type ReadinessResult = { score: number; days_left: number; status: string; dimensions: { label: string; complete: boolean; weight: number }[]; actions: { label: string; urgency: string }[] };
function ReadinessVisual({ data }: { data: ReadinessResult }) { return <div><VisualHeader title="Departure readiness" note={`${data.days_left} days until departure`} /><div className="grid md:grid-cols-[220px_1fr] gap-8 items-center"><ScoreRing score={data.score} label={data.status} /><div className="space-y-3">{data.dimensions.map(item => <div key={item.label}><div className="flex justify-between text-xs mb-1"><span>{item.label}</span><span>{item.complete ? "Ready" : "Missing"}</span></div><Bar value={item.complete ? 100 : 8} color={item.complete ? "#10b981" : "#f43f5e"} /></div>)}</div></div><h3 className="text-sm font-semibold mt-8 mb-2">Next actions</h3>{data.actions.map(action => <div key={action.label} className="flex justify-between border-t border-[var(--border)] py-2 text-sm"><span>{action.label}</span><span className={action.urgency === "now" ? "text-rose-400" : "text-amber-400"}>{action.urgency}</span></div>)}</div>; }

type ScenarioResult = { scenarios: { name: string; expected: number; minimum: number; maximum: number; note: string; categories: { name: string; amount: number }[] }[] };
function ScenarioVisual({ data }: { data: ScenarioResult }) { const max = Math.max(...data.scenarios.map(item => item.maximum)); return <div><VisualHeader title="Three ways to travel" note="Ranges include ordinary price movement" /><div className="grid md:grid-cols-3 gap-px bg-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">{data.scenarios.map((item, index) => <div key={item.name} className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--fg-muted)]">{item.name}</p><p className="font-display text-3xl my-2">{formatINR(item.expected)}</p><div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden"><div className={cn("h-full", index === 0 ? "bg-cyan-400" : index === 1 ? "bg-emerald-400" : "bg-amber-400")} style={{ width: `${item.maximum / max * 100}%` }} /></div><p className="text-[10px] text-[var(--fg-muted)] mt-2">{formatINR(item.minimum)} – {formatINR(item.maximum)}</p><p className="text-xs mt-4">{item.note}</p></div>)}</div><div className="mt-7 space-y-3">{data.scenarios[1].categories.map(category => <div key={category.name} className="grid grid-cols-[90px_1fr_auto] gap-3 items-center text-xs"><span>{category.name}</span><Bar value={category.amount / max * 300} color="#34d399" /><span>{formatINR(category.amount)}</span></div>)}</div></div>; }

type BookingResult = { items: { name: string; current_price: number; typical_low: number; typical_high: number; price_position_pct: number; action: string; confidence: number; deadline_days: number }[] };
function BookingVisual({ data }: { data: BookingResult }) { const item = data.items[0]; return <div><VisualHeader title={item.name} note={`${item.confidence}% decision confidence`} /><div className="py-10"><div className="flex justify-between text-xs text-[var(--fg-muted)]"><span>{formatINR(item.typical_low)}</span><span>Typical range</span><span>{formatINR(item.typical_high)}</span></div><div className="relative h-5 mt-3 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"><span className="absolute top-1/2 -translate-y-1/2 w-1 h-9 bg-white shadow" style={{ left: `${item.price_position_pct}%` }} /></div><p className="font-display text-5xl mt-8">{formatINR(item.current_price)}</p></div><div className="border-t border-[var(--border)] pt-5 flex items-end justify-between"><div><p className="text-xs uppercase text-[var(--fg-muted)]">Recommendation</p><p className="text-4xl font-display capitalize text-emerald-400">{item.action}</p></div><p className="text-sm text-right">Act within<br /><strong>{item.deadline_days} days</strong></p></div></div>; }

type DestinationResult = { recommended: string; destinations: ({ name: string; score: number; affordability: number; weather: number; visa_ease: number; transit: number; interests: number; crowd_comfort: number })[] };
function DestinationVisual({ data }: { data: DestinationResult }) { const metrics = ["affordability", "weather", "visa_ease", "transit", "interests", "crowd_comfort"] as const; return <div><VisualHeader title="Destination fit" note={`${data.recommended} is the strongest overall match`} /><div className="overflow-x-auto"><div className="min-w-[600px]"><div className="grid grid-cols-[140px_repeat(3,1fr)] border-b border-[var(--border)] pb-3 text-sm"><span>Dimension</span>{data.destinations.map(item => <span key={item.name} className="text-center font-semibold">{item.name}<strong className="block text-2xl font-display text-emerald-400">{item.score}</strong></span>)}</div>{metrics.map(metric => <div key={metric} className="grid grid-cols-[140px_repeat(3,1fr)] py-3 border-b border-[var(--border)] items-center"><span className="text-xs capitalize text-[var(--fg-muted)]">{metric.replace("_", " ")}</span>{data.destinations.map(item => <div key={item.name} className="px-3"><Bar value={item[metric]} color={item[metric] >= 80 ? "#10b981" : item[metric] >= 60 ? "#f59e0b" : "#f43f5e"} /></div>)}</div>)}</div></div></div>; }

type PaceResult = { score: number; problem_days: number[]; days: { day: number; score: number; pace: string; activity_hours: number; travel_hours: number; issues: string[] }[] };
function PaceVisual({ data }: { data: PaceResult }) { return <div><VisualHeader title="Itinerary pace" note={`${data.problem_days.length} days need attention`} /><div className="flex items-end gap-3 h-56 border-b border-[var(--border)] mb-6">{data.days.map(day => <div key={day.day} className="flex-1 h-full flex flex-col justify-end"><span className="text-xs text-center mb-2">{day.score}</span><div className={cn("w-full rounded-t-sm", day.score >= 85 ? "bg-emerald-400" : day.score >= 65 ? "bg-amber-400" : "bg-rose-500")} style={{ height: `${day.score}%` }} /><span className="text-[10px] text-center mt-2">Day {day.day}</span></div>)}</div>{data.days.map(day => <div key={day.day} className="py-3 border-b border-[var(--border)]"><div className="flex justify-between"><span className="text-sm font-semibold">Day {day.day} · <span className="capitalize">{day.pace}</span></span><span className="text-xs text-[var(--fg-muted)]">{day.activity_hours}h activity / {day.travel_hours}h travel</span></div>{day.issues.map(issue => <p key={issue} className="text-xs text-rose-400 mt-1">{issue}</p>)}</div>)}</div>; }

type RiskResult = { base: number; likely_low: number; likely_high: number; recommended_buffer: number; categories: { name: string; amount: number; low: number; high: number; risk_amount: number }[] };
function RiskVisual({ data }: { data: RiskResult }) { const max = data.likely_high; return <div><VisualHeader title="Budget uncertainty" note={`Recommended buffer ${formatINR(data.recommended_buffer)}`} /><div className="py-8"><p className="font-display text-4xl">{formatINR(data.base)}</p><p className="text-xs text-[var(--fg-muted)] mb-5">Current baseline</p><div className="relative h-10 bg-[var(--surface-2)] rounded-md"><div className="absolute h-full bg-amber-400/30 border-x border-amber-400" style={{ left: `${data.likely_low / max * 100}%`, width: `${(data.likely_high - data.likely_low) / max * 100}%` }} /><span className="absolute -bottom-6 text-[10px]" style={{ left: `${data.likely_low / max * 100}%` }}>{formatINR(data.likely_low)}</span><span className="absolute -bottom-6 right-0 text-[10px]">{formatINR(data.likely_high)}</span></div></div><div className="mt-8 space-y-4">{data.categories.map(item => <div key={item.name}><div className="flex justify-between text-xs mb-1"><span>{item.name}</span><span>+{formatINR(item.risk_amount)} at risk</span></div><div className="relative h-3 rounded-full bg-[var(--surface-2)]"><div className="absolute h-full rounded-full bg-emerald-500/50" style={{ width: `${item.amount / max * 100}%` }} /><div className="absolute h-full rounded-r-full bg-amber-400/70" style={{ left: `${item.amount / max * 100}%`, width: `${item.risk_amount / max * 100}%` }} /></div></div>)}</div></div>; }

function VisualHeader({ title, note }: { title: string; note: string }) { return <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-4 mb-6"><h2 className="font-display text-3xl">{title}</h2><p className="text-xs text-[var(--fg-muted)] text-right">{note}</p></div>; }
function Bar({ value, color }: { value: number; color: string }) { return <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} /></div>; }
function ScoreRing({ score, label }: { score: number; label: string }) { return <div className="relative w-48 h-48 mx-auto rounded-full grid place-items-center" style={{ background: `conic-gradient(#10b981 ${score * 3.6}deg, var(--surface-2) 0)` }}><div className="w-36 h-36 rounded-full bg-[var(--surface)] grid place-items-center text-center"><div><strong className="font-display text-5xl">{score}</strong><span className="block text-[10px] uppercase text-[var(--fg-muted)]">{label}</span></div></div></div>; }