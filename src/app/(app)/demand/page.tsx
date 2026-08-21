import { Figure } from "@/components/Figure";
import { PageHeader } from "@/components/PageHeader";
import { Spark } from "@/components/Spark";
import { StatGrid } from "@/components/StatGrid";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { eachDateInclusive, asBusinessDate } from "@/lib/date";
import { fromCents, toDisplay } from "@/lib/money";

const DAY = "2026-08-19";
const WINDOW_END = "2026-08-20";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayLabel(d: string): string {
  const parts = d.split("-");
  const month = MONTH_NAMES[Number(parts[1] ?? "0") - 1] ?? "";
  return `${Number(parts[2] ?? "0")} ${month}`.trim();
}

function hourLabel(h: string | null): string {
  return (h ?? "").padStart(2, "0");
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = sp.range === "7" ? 7 : 14;
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "appt_value_by_hour" });
  const counts = await activeFacts(db, { measureKey: "appt_count_by_hour" });

  const hours = counts
    .filter((f) => f.businessDate === DAY && f.dimensionType === "hour")
    .sort((a, b) => Number(a.dimensionValue) - Number(b.dimensionValue));
  const hourValues = values.filter((f) => f.businessDate === DAY && f.dimensionType === "hour");
  const totalC = counts.find((f) => f.businessDate === DAY && f.isTotalRow);
  const totalV = values.find((f) => f.businessDate === DAY && f.isTotalRow);
  const firstHour = hours[0];
  const peak = hours.reduce(
    (a, b) => ((a?.valueNumeric ?? -1) >= b.valueNumeric ? a : b),
    firstHour,
  );

  const windowStart = range === 7 ? "2026-08-14" : "2026-08-07";
  const window = eachDateInclusive(asBusinessDate(windowStart), asBusinessDate(WINDOW_END)).map(
    (d) => {
      const row = counts.find((f) => f.businessDate === d && f.isTotalRow);
      return { x: d.slice(5), row };
    },
  );
  const windowProvRow = window.map((w) => w.row).find((r) => r !== undefined);
  const gapCount = window.filter((w) => !w.row).length;

  return (
    <>
      <PageHeader
        kicker="D1 · report 1421 · service date"
        title="Demand by hour"
        lede="One measure family from a single report — appointment counts and claimed value by hour, same source, same grain, same basis. Missing days are drawn as gaps, never as zero."
        right={
          <span className="seg">
            <a className={`seg-opt${range === 7 ? " selected" : ""}`} href="/demand?range=7">
              7 days
            </a>
            <a className={`seg-opt${range === 14 ? " selected" : ""}`} href="/demand?range=14">
              14 days
            </a>
          </span>
        }
      />
      <div style={{ display: "grid", gap: 28 }}>
        {totalC && totalV && peak ? (
          <StatGrid columns={3} compact>
            <Figure
              label="Appointments"
              value={String(totalC.valueNumeric)}
              sub="appt_count_by_hour · total row"
              dateBasis="service_date"
              provText="D1 · 1421"
              provenance={provenanceOf(totalC)}
            />
            <Figure
              label="Claimed appointment value"
              value={toDisplay(fromCents(totalV.valueNumeric))}
              sub="appt_value_by_hour · total row"
              dateBasis="service_date"
              provText="D1 · 1421"
              provenance={provenanceOf(totalV)}
            />
            <Figure
              label="Peak hour"
              value={`${hourLabel(peak.dimensionValue)}:00 · ${peak.valueNumeric}`}
              sub="appt_count_by_hour · hour dimension"
              dateBasis="service_date"
              provText="D1 · 1421"
              provenance={provenanceOf(peak)}
            />
          </StatGrid>
        ) : (
          <section className="panel-dotted">
            <div className="panel-dotted-title">Not available</div>
            <p className="note">
              Report 1421 delivered no total row for {dayLabel(DAY)}. Absent is not zero — nothing
              is rendered as 0.
            </p>
          </section>
        )}

        {firstHour ? (
          <section className="chart">
            <div className="chart-head">
              <h2 className="chart-title">
                {dayLabel(DAY)} · appointments and value by hour
              </h2>
            </div>
            <Spark
              dateBasis="service_date"
              measureKey="appt_count_by_hour"
              points={hours.map((h) => ({ x: hourLabel(h.dimensionValue), y: h.valueNumeric }))}
              valuePoints={hours.map((h) => {
                const v = hourValues.find((x) => x.dimensionValue === h.dimensionValue);
                return { x: hourLabel(h.dimensionValue), y: v ? v.valueNumeric : null };
              })}
              valueMeasureKey="appt_value_by_hour"
              peakX={peak ? hourLabel(peak.dimensionValue) : undefined}
              height={230}
              legend
              provenance={provenanceOf(firstHour)}
            />
          </section>
        ) : (
          <section className="panel-dotted">
            <div className="panel-dotted-title">Hourly detail not available</div>
            <p className="note">
              No D1 hour rows were delivered for {dayLabel(DAY)}. The chart is withheld rather than
              drawn flat at the axis.
            </p>
          </section>
        )}

        <section className="chart">
          <div className="chart-head">
            <h2 className="chart-title">
              {range === 7 ? "Seven" : "Fourteen"}-day window · {dayLabel(windowStart)} →{" "}
              {dayLabel(WINDOW_END)}
            </h2>
            {gapCount > 0 ? (
              <span className="note">
                {gapCount === 1 ? "One day has" : `${gapCount} days have`} no delivery — drawn
                hatched and excluded from every calculation.
              </span>
            ) : null}
          </div>
          {windowProvRow ? (
            <Spark
              dateBasis="service_date"
              measureKey="appt_count_by_hour"
              strip
              points={window.map((w) => ({ x: w.x, y: w.row ? w.row.valueNumeric : null }))}
              provenance={provenanceOf(windowProvRow)}
            />
          ) : (
            <p className="na">
              Not available — no D1 deliveries cover this window. Absent is not zero.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
