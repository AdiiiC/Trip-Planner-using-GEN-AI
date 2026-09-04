"use client";

// Client-side PDF generation for a calculated budget. Imported lazily so
// @react-pdf/renderer stays out of the main bundle.

import {
  Document, Page, Text, View, StyleSheet, pdf,
} from "@react-pdf/renderer";
import type { BudgetResult } from "@/lib/types";
import type { CashPlanSummary, CashPlanStop } from "@/lib/cashPlan";

const inr = (n: number) => `Rs ${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const foreign = (n: number, currency: string) => `${new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: currency === "VND" ? 0 : 2,
}).format(n)} ${currency}`;
// Helvetica is a standard PDF font with no glyph for "→" — it renders as a stray quote.
const ascii = (v: string) => v.replace(/→/g, "->");

const C = {
  fg: "#111827", muted: "#6b7280", line: "#e5e7eb", accent: "#047857",
  band: "#f3f4f6", indigo: "#4338ca",
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: C.fg, fontFamily: "Helvetica" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: C.muted, marginTop: 2 },
  meta: { fontSize: 8, color: C.muted, marginTop: 6 },
  grandBox: { marginTop: 14, marginBottom: 8, padding: 12, backgroundColor: C.band, borderRadius: 6 },
  grandLabel: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  grand: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 2 },
  grandSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, color: C.fg },
  subTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3, color: C.muted },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.line },
  cellL: { flex: 1 },
  cellM: { width: 90, color: C.muted },
  cellR: { width: 80, textAlign: "right" },
  totalRow: { flexDirection: "row", paddingVertical: 4, marginTop: 2, borderTopWidth: 1, borderTopColor: C.fg },
  bold: { fontFamily: "Helvetica-Bold" },
  accent: { color: C.accent, fontFamily: "Helvetica-Bold" },
  columns: { flexDirection: "row", gap: 8, marginTop: 5 },
  metric: { flex: 1, padding: 7, backgroundColor: C.band, borderRadius: 4 },
  metricLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase" },
  metricValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  stop: { paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line },
  stopHead: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  stopName: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 10 },
  stopRate: { fontSize: 8, color: C.muted },
  stopGrid: { flexDirection: "row", gap: 8 },
  stopColumn: { flex: 1 },
  stopLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase" },
  stopValue: { fontSize: 8, marginTop: 1 },
  notice: { paddingVertical: 2, fontSize: 8, color: C.muted },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
});

function Line({ l, m, r, boldRow }: { l: string; m?: string; r: string; boldRow?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.cellL, boldRow ? s.bold : {}]}>{l}</Text>
      <Text style={s.cellM}>{m ?? ""}</Text>
      <Text style={[s.cellR, boldRow ? s.bold : {}]}>{r}</Text>
    </View>
  );
}

function Total({ l, r }: { l: string; r: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.cellL, s.bold]}>{l}</Text>
      <Text style={s.cellM}></Text>
      <Text style={[s.cellR, s.bold]}>{r}</Text>
    </View>
  );
}

function PdfMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>
  );
}

function PdfCashStop({ stop }: { stop: CashPlanStop }) {
  return (
    <View style={s.stop} wrap={false}>
      <View style={s.stopHead}>
        <Text style={s.stopName}>{stop.destination}</Text>
        <Text style={s.stopRate}>
          1 USD = {stop.rate_per_usd.toLocaleString("en-IN")} {stop.currency}
          {stop.rate_source ? `  |  ${stop.rate_source}` : ""}
          {stop.rate_checked_at ? `  |  ${stop.rate_checked_at}` : ""}
        </Text>
      </View>
      <View style={s.stopGrid}>
        <View style={s.stopColumn}>
          <Text style={s.stopLabel}>Arrive with</Text>
          <Text style={s.stopValue}>{foreign(stop.arrival_cash, stop.currency)}</Text>
        </View>
        <View style={s.stopColumn}>
          <Text style={s.stopLabel}>Exchange locally</Text>
          <Text style={s.stopValue}>{usd(stop.usd_amount)} -&gt; {foreign(stop.local_from_usd, stop.currency)}</Text>
        </View>
        <View style={s.stopColumn}>
          <Text style={s.stopLabel}>Committed</Text>
          <Text style={s.stopValue}>{foreign(stop.committed_local, stop.currency)}</Text>
        </View>
        <View style={s.stopColumn}>
          <Text style={s.stopLabel}>Available after</Text>
          <Text style={s.stopValue}>{foreign(stop.available_after_commitments, stop.currency)}</Text>
        </View>
      </View>
    </View>
  );
}

function BudgetDoc({ result, title, cashPlan }: { result: BudgetResult; title: string; cashPlan?: CashPlanSummary }) {
  const fc = result.fixed_costs;
  const cc = result.cash_conversion;
  const gt = result.grand_total;
  // Absent from results computed by a backend that predates these fields.
  const { trip, target } = result;
  const now = new Date().toLocaleString();

  return (
    <Document title={title}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>Trip Budget · Per-person share · Cash conversion breakdown</Text>
        <Text style={s.meta}>Travelers: {result.travelers}   ·   Generated: {now}   ·   Wayfare</Text>

        <View style={s.grandBox}>
          <Text style={s.grandLabel}>Grand Total (Your Share)</Text>
          <Text style={s.grand}>{inr(gt.inr)}</Text>
          <Text style={s.grandSub}>~ {usd(gt.usd)}   ·   Prepaid {inr(gt.prepaid_inr)} + Pocket money {inr(gt.pocket_money_inr)}</Text>
        </View>

        {/* Fixed costs */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>1. Fixed Costs</Text>

          <Text style={s.subTitle}>Flights</Text>
          {fc.flights.items.map((f, i) => <Line key={i} l={ascii(f.route)} m={f.date} r={inr(f.amount_inr)} />)}
          <Line l="Flights subtotal" r={inr(fc.flights.total_inr)} boldRow />

          <Text style={s.subTitle}>Stays</Text>
          {fc.stays.items.map((st, i) => <Line key={i} l={st.destination} m={st.split} r={inr(st.per_person_inr)} />)}
          <Line l="Stays subtotal" r={inr(fc.stays.total_inr)} boldRow />

          <Text style={s.subTitle}>Sightseeing</Text>
          {fc.sightseeing.items.map((sg, i) => <Line key={i} l={sg.name} m={sg.original} r={inr(sg.amount_inr)} />)}
          <Line l="Sightseeing subtotal" r={inr(fc.sightseeing.total_inr)} boldRow />

          <Text style={s.subTitle}>Extras</Text>
          {fc.extras.items.map((ex, i) =>
            <Line key={i} l={`${ex.name}${ex.prepaid ? " (prepaid)" : ""}`} m={ex.original} r={inr(ex.amount_inr)} />)}
          <Line l="Extras subtotal" r={inr(fc.extras.total_inr)} boldRow />

          <Total l="Total Fixed" r={inr(fc.total_inr)} />
          <Line l="  of which prepaid (before departure)" r={inr(fc.prepaid_total_inr)} />
          <Line l="  of which paid on the ground" r={inr(fc.on_ground_total_inr)} />
        </View>

        <Text style={s.footer}>
          Figures are per person. Sightseeing and on-arrival extras are paid from pocket money and are not double-counted.
        </Text>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Cash execution plan</Text>
        <Text style={s.sub}>What to pack, exchange at each destination, and keep in reserve</Text>
        <Text style={s.meta}>{title}   ·   Generated: {now}   ·   Wayfare</Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>2. Cash &amp; Pocket Money</Text>
          <View style={s.columns}>
            <PdfMetric label="Pocket money" value={usd(cc.pocket_money_usd)} />
            <PdfMetric label="Committed abroad" value={inr(cc.committed_inr)} />
            <PdfMetric label="Free to spend" value={inr(cc.free_spend_inr)} />
          </View>

          <Text style={s.subTitle}>Pack in India</Text>
          {cc.allocations.map((allocation, index) => (
            <Line key={index} l={ascii(allocation.display)} r={inr(allocation.inr_spent)} />
          ))}
          {cashPlan ? (
            <>
              <Line l="Physical USD cash" m={`${cashPlan.usd_notes_100} x $100 + ${cashPlan.usd_notes_50} x $50`} r={usd(cashPlan.physical_usd_cash)} />
              <Line l="Forex card balance" r={usd(cashPlan.forex_card_usd)} />
              <Line
                l="Emergency USD reserve"
                m={`${cashPlan.reserve_notes_100} x $100 + ${cashPlan.reserve_notes_50} x $50`}
                r={usd(Math.max(cashPlan.reserve_usd, 0))}
                boldRow
              />
            </>
          ) : (
            <Line l="Unconverted USD / forex balance" r={usd(cc.usd_forex_remaining_usd)} />
          )}
        </View>

        {cashPlan && cashPlan.stops.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>3. Country Plan</Text>
            {cashPlan.stops.map((stop, index) => <PdfCashStop key={`${stop.destination}-${index}`} stop={stop} />)}
            <Line
              l="Projected saving versus buying local cash before departure"
              r={inr(cashPlan.projected_saving_inr)}
              boldRow
            />
          </View>
        )}

        {cashPlan && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>4. Checks</Text>
            {cashPlan.notices.map((notice, index) => (
              <Text key={index} style={s.notice}>[{notice.tone.toUpperCase()}] {notice.text}</Text>
            ))}
          </View>
        )}

        {trip && (trip.days > 0 || target) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>5. Per Day &amp; Target</Text>
            {trip.days > 0 && (
              <>
                <Line l="Trip length" m={trip.start_date && trip.end_date ? `${trip.start_date} -> ${trip.end_date}` : undefined}
                  r={`${trip.nights} nights / ${trip.days} days`} />
                <Line l="All-in per day" r={inr(trip.per_day_all_in_inr)} />
                <Line l="Cash per day (pocket money)" r={inr(trip.per_day_on_ground_inr)} />
                <Line l="Free to spend per day" r={inr(trip.per_day_free_inr)} />
                <Line l="Per night on stays" r={inr(trip.per_night_stay_inr)} />
              </>
            )}
            {target && (
              <>
                <Line l="Budget target" m={target.per_day_inr > 0 ? `${inr(target.per_day_inr)}/day` : undefined}
                  r={inr(target.amount_inr)} />
                <Line
                  l={target.status === "over" ? "Over target by" : "Under target by"}
                  m={`${Math.round(target.pct_used)}% used`}
                  r={inr(Math.abs(target.delta_inr))}
                  boldRow
                />
              </>
            )}
          </View>
        )}

        <Text style={s.footer}>
          Cash exchange results use planning rates and may differ at the counter. Keep physical USD separate from card funds.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateBudgetPdfBlob(result: BudgetResult, title: string, cashPlan?: CashPlanSummary): Promise<Blob> {
  return pdf(<BudgetDoc result={result} title={title} cashPlan={cashPlan} />).toBlob();
}
