import { DateBasisBadge } from "@/components/DateBasisBadge";
import { Figure } from "@/components/Figure";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { Spark } from "@/components/Spark";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf, type FactRow } from "@/lib/queries/facts";
import { latestDeliveredDay } from "@/lib/business-day";

/**
 * Labor & coverage — merged screen (design spec §3.7). /coverage redirects
 * here. Three hour components are surfaced separately and never divided
 * into one another (glossary: the reported utilization formula is unknown —
 * H6). Technicians are pseudonymous at source (I11); missing series render
 * as "Not available", never 0 (I5); every figure carries provenance (I4).
 */

function hoursDisplay(n: number): string {
  return `${(n / 100).toFixed(2)} h`;
}

function hourLabel(h: string | null): string {
  return (h ?? "").padStart(2, "0");
}

const headingValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 400,
  fontSize: 22,
  fontVariantNumeric: "tabular-nums",
};

export default async function LaborPage() {
  const db = await getDb();

  // D8 — hours-work-summary totals (report 1243)
  const d8Keys = [
    "labor_scheduled_hours",
    "labor_booked_hours",
    "labor_service_hours",
    "labor_client_count",
    "labor_utilization_pct_reported",
  ] as const;
  const d8: FactRow[] = [];
  for (const k of d8Keys) d8.push(...(await activeFacts(db, { measureKey: k })));
  const tot = (k: string) => d8.find((r) => r.measureKey === k && r.isTotalRow);
  const scheduled = tot("labor_scheduled_hours");
  const booked = tot("labor_booked_hours");
  const serviced = tot("labor_service_hours");
  const clients = tot("labor_client_count");
  const util = tot("labor_utilization_pct_reported");

  // D1 — hourly demand for the coverage chart. The day is the latest date
  // D1 delivered a total row for (shared derivation with Today — I5: never
  // a hardcoded date; null renders the explicit no-delivery state below).
  const d1 = await activeFacts(db, { measureKey: "appt_count_by_hour" });
  const demandDay = latestDeliveredDay(d1, { measureKeys: ["appt_count_by_hour"], totalRowsOnly: true });
  const demand = d1
    .filter((f) => f.businessDate === demandDay && f.dimensionType === "hour")
    .sort((a, b) => Number(a.dimensionValue) - Number(b.dimensionValue));
  const firstDemand = demand[0];
  const peak = demand.reduce((a, b) => ((a?.valueNumeric ?? -1) >= b.valueNumeric ? a : b), firstDemand);

  // D10 — technician weekly schedule (pseudonyms only, I11)
  const sched = await activeFacts(db, { measureKey: "sched_shift_hours" });
  const techRows = sched
    .filter((f) => f.dimensionType === "technician" && !f.isTotalRow)
    .sort((a, b) => b.valueNumeric - a.valueNumeric);
  const firstTech = techRows[0];
  const schedPool = sched.find((f) => f.isTotalRow);

  // Bars are drawn to a common scale; no derived percentage is printed
  // (the utilization formula is unknown — H6). Same source, same grain,
  // same basis, so a shared scale is I2-legal.
  const hourBars = [
    { label: "scheduled", row: scheduled, cls: "hours-bar--scheduled" },
    { label: "booked", row: booked, cls: "hours-bar--booked" },
    { label: "serviced", row: serviced, cls: "hours-bar--serviced" },
  ].filter((b): b is { label: string; row: FactRow; cls: string } => b.row !== undefined);
  const barMax = Math.max(...hourBars.map((b) => b.row.valueNumeric), 1);

  return (
    <>
      <PageHeader
        kicker="D8 · report 1243 · D10 weekly schedule"
        title="Labor & coverage"
        lede="Three hour components, kept separate. Technicians are pseudonymous at source — no names enter Sporacle."
      />
      <div style={{ display: "grid", gap: 28 }}>
        <section className="panel" style={{ padding: "28px 32px" }}>
          <div className="chart-head">
            <h2 className="chart-title">Hours, uncombined</h2>
            <span className="note">We do not divide these into one another.</span>
          </div>
          {hourBars.length > 0 ? (
            <div style={{ display: "grid", gap: 18 }}>
              {hourBars.map((b) => (
                <div key={b.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 16,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>
                      {b.label}{" "}
                      <ProvenanceChip provenance={provenanceOf(b.row)}>provenance</ProvenanceChip>
                    </span>
                    <span style={headingValue}>{hoursDisplay(b.row.valueNumeric)}</span>
                  </div>
                  <div
                    className={`hours-bar ${b.cls}`}
                    style={{ width: `${Math.max((b.row.valueNumeric / barMax) * 100, 1)}%` }}
                    title={`${b.row.measureKey}: ${(b.row.valueNumeric / 100).toFixed(2)} hours`}
                  />
                </div>
              ))}
              <div className="stat-meta">
                <DateBasisBadge basis="service_date" />
                <span className="note">
                  labor_scheduled_hours · labor_booked_hours · labor_service_hours — one source, one
                  grain{clients ? <> · {clients.valueNumeric} clients seen</> : null}
                </span>
                {clients ? (
                  <ProvenanceChip provenance={provenanceOf(clients)}>D8 · 1243</ProvenanceChip>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="na">
              Not available — report 1243 delivered no hour totals for this window. Absent is not
              zero (I5).
            </p>
          )}
          <div className="hairline" style={{ margin: "22px 0 0" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 28,
              alignItems: "end",
              paddingTop: 18,
            }}
          >
            <p className="note" style={{ margin: 0, maxWidth: "56ch" }}>
              The three components above are the facts; no utilization percentage is computed from
              them. Book4Time reports one, and we cannot reproduce it from these numbers.
            </p>
            {util ? (
              <div style={{ borderLeft: "1px dashed var(--color-accent-500)", paddingLeft: 28 }}>
                <Figure
                  label="reported utilization"
                  value={`${(util.valueNumeric / 100).toFixed(0)}%`}
                  sub="labor_utilization_pct_reported"
                  dateBasis="service_date"
                  provText="D8 · 1243"
                  provenance={provenanceOf(util)}
                  status={{
                    kind: "unvalidated",
                    label: "formula unknown",
                    note: "It matches no division of the three components. See H6.",
                  }}
                />
              </div>
            ) : (
              <p className="na" style={{ margin: 0 }}>
                Reported utilization — not available.
              </p>
            )}
          </div>
        </section>

        <div
          style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, alignItems: "stretch" }}
        >
          <section className="chart">
            <div className="chart-head">
              <h2 className="chart-title">
                Coverage against demand{demandDay ? ` · ${demandDay}` : ""}
              </h2>
            </div>
            <p className="note" style={{ margin: "0 0 16px" }}>
              Hourly demand from D1 against the D10 schedule. Scheduled capacity arrives only as a
              daily pool (technician × day), so it is drawn as a flat band — not interpolated onto
              the hours.
            </p>
            {firstDemand ? (
              <Spark
                dateBasis="service_date"
                measureKey="appt_count_by_hour"
                points={demand.map((d) => ({
                  x: hourLabel(d.dimensionValue),
                  y: d.valueNumeric,
                }))}
                peakX={peak ? hourLabel(peak.dimensionValue) : undefined}
                height={230}
                // Band position is illustrative only: the pool is a
                // technician × day figure and has no lawful mapping onto an
                // hourly appointment-count scale (I2/I3) — it is drawn flat.
                band={schedPool ? { pct: 52, label: "daily scheduled pool · flat" } : undefined}
                provenance={provenanceOf(firstDemand)}
              />
            ) : (
              <p className="na">
                {demandDay
                  ? `Not available — no D1 hour rows were delivered for ${demandDay}. The chart is withheld rather than drawn flat at the axis (I5).`
                  : "Not available — report 1421 (D1) has delivered no business day yet. The chart is withheld rather than drawn flat at the axis (I5)."}
              </p>
            )}
            <div className="hairline" style={{ margin: "16px 0 12px" }} />
            <p className="note" style={{ margin: 0 }}>
              Where the peak presses against the flat pool is a conversation, not a computation —
              staffing advice is gated behind the{" "}
              <a className="link-action" href="/gates">
                sufficiency gates →
              </a>
            </p>
          </section>

          <section className="panel">
            <div className="chart-head">
              <h2 className="chart-title">Technicians</h2>
              <StatusBadge kind="insufficient" label="totals only" />
            </div>
            <p className="note" style={{ margin: "0 0 14px" }}>
              Technician detail rows are withheld at source — D8 arrives as totals. The weekly
              schedule (D10) arrives pseudonymised; the pseudonym↔name mapping never reaches these
              views.
            </p>
            {firstTech ? (
              <div>
                {techRows.map((t) => (
                  <div
                    key={t.dimensionValue ?? t.ingestRunId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "9px 0",
                      borderBottom: "1px solid var(--color-divider)",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>{t.dimensionValue}</span>
                    <span>{hoursDisplay(t.valueNumeric)}</span>
                  </div>
                ))}
                {schedPool ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "9px 0",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--color-neutral-500)",
                    }}
                  >
                    <span>all pseudonyms · total row</span>
                    <span>{hoursDisplay(schedPool.valueNumeric)}</span>
                  </div>
                ) : null}
                <div className="stat-meta" style={{ marginTop: 14 }}>
                  <DateBasisBadge basis="service_date" />
                  <ProvenanceChip provenance={provenanceOf(firstTech)}>
                    D10 · sched_shift_hours
                  </ProvenanceChip>
                </div>
              </div>
            ) : (
              <p className="na" style={{ margin: 0 }}>
                Not available — no D10 weekly-schedule delivery covers this window. Absent is not
                zero (I5).
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
