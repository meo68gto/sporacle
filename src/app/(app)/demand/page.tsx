import { Figure } from "@/components/Figure";
import { Spark } from "@/components/Spark";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { eachDateInclusive, asBusinessDate } from "@/lib/date";
import { fromCents, toDisplay } from "@/lib/money";

export default async function DemandPage() {
  const db = await getDb();
  const facts = await activeFacts(db, { measureKey: "appt_value_by_hour" });
  const counts = await activeFacts(db, { measureKey: "appt_count_by_hour" });
  const day = "2026-08-19";
  const hours = counts.filter((f) => f.businessDate === day && f.dimensionType === "hour");
  const values = facts.filter((f) => f.businessDate === day && f.dimensionType === "hour");
  const totalC = counts.find((f) => f.businessDate === day && f.isTotalRow);
  const totalV = facts.find((f) => f.businessDate === day && f.isTotalRow);
  const peak = hours.reduce((a, b) => ((a?.valueNumeric ?? 0) > b.valueNumeric ? a : b), hours[0]);
  const window = eachDateInclusive(asBusinessDate("2026-08-07"), asBusinessDate("2026-08-20")).map((d) => {
    const row = counts.find((f) => f.businessDate === d && f.isTotalRow);
    return { x: d.slice(5), y: row ? row.valueNumeric : null };
  });
  return (
    <>
      <h1>Demand by hour</h1>
      <p className="lede">Single measure family from D1 / 1421. service_date. No cross-source math.</p>
      {totalC && totalV ? (
        <div className="grid">
          <div className="card">
            <Figure label="appt_count_by_hour total" value={String(totalC.valueNumeric)} provenance={provenanceOf(totalC)} />
          </div>
          <div className="card">
            <Figure label="appt_value_by_hour total" value={toDisplay(fromCents(totalV.valueNumeric))} provenance={provenanceOf(totalV)} />
          </div>
          {peak ? (
            <div className="card">
              <Figure
                label={`peak hour ${peak.dimensionValue} appt_count_by_hour`}
                value={String(peak.valueNumeric)}
                provenance={provenanceOf(peak)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="card">
        <Spark
          dateBasis="service_date"
          measureKey="appt_count_by_hour"
          points={hours.map((h) => ({ x: h.dimensionValue ?? "", y: h.valueNumeric }))}
          peakX={peak?.dimensionValue ?? undefined}
        />
      </div>
      <div className="card">
        <h2>14-day window (2026-08-07 → 2026-08-20)</h2>
        <p className="meta">Missing days render as gaps, not zeros (I5).</p>
        <Spark dateBasis="service_date" measureKey="appt_count_by_hour" points={window} />
      </div>
      <div className="card">
        <Spark
          dateBasis="service_date"
          measureKey="appt_value_by_hour"
          points={values.map((h) => ({ x: h.dimensionValue ?? "", y: h.valueNumeric }))}
        />
      </div>
    </>
  );
}
