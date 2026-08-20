import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

export default async function OccupancyPage() {
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "service_value_by_facility" });
  const counts = await activeFacts(db, { measureKey: "service_count_by_facility" });
  const fill = await activeFacts(db, { measureKey: "facility_fill_pct" });
  const dayV = values.filter((f) => f.businessDate === "2026-08-19");
  const totalV = dayV.find((f) => f.isTotalRow);
  const totalC = counts.find((f) => f.businessDate === "2026-08-19" && f.isTotalRow);
  const overallFill = fill.find((f) => f.businessDate === "2026-08-19" && f.isTotalRow);
  const hottest = fill.find((f) => f.businessDate === "2026-08-19" && f.dimensionType === "hottest");
  return (
    <>
      <h1>Occupancy</h1>
      <p className="lede">D4 / 1524 · service_date. Fill% is not a headline metric.</p>
      <div className="grid">
        {totalC && totalV ? (
          <>
            <div className="card">
              <Figure label="service_count_by_facility total" value={String(totalC.valueNumeric)} provenance={provenanceOf(totalC)} />
            </div>
            <div className="card">
              <Figure label="service_value_by_facility total" value={toDisplay(fromCents(totalV.valueNumeric))} provenance={provenanceOf(totalV)} />
            </div>
          </>
        ) : null}
        {overallFill ? (
          <div className="card">
            <Figure
              label="facility_fill_pct overall"
              value={`${(overallFill.valueNumeric / 100).toFixed(2)}%`}
              provenance={provenanceOf(overallFill)}
              unvalidated="unvalidated — capacity denominator unknown (H5)"
            />
          </div>
        ) : null}
        {hottest ? (
          <div className="card">
            <Figure
              label="facility_fill_pct hottest"
              value={`${(hottest.valueNumeric / 100).toFixed(2)}%`}
              provenance={provenanceOf(hottest)}
              unvalidated="unvalidated — not comparable to overall without the denominator"
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
