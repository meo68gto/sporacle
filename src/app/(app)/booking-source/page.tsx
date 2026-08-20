import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

export default async function BookingSourcePage() {
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "booking_value_by_source" });
  const counts = await activeFacts(db, { measureKey: "booking_count_by_source" });
  const day = values.filter((f) => f.businessDate === "2026-08-19" && f.dimensionType === "source");
  const total = values.find((f) => f.businessDate === "2026-08-19" && f.isTotalRow);
  return (
    <>
      <h1>Booking source mix</h1>
      <p className="lede notice">
        Date basis is <strong>booking_date</strong>, not service_date. This page is not the same day&apos;s delivered
        business. Hypothesis H1 remains open.
      </p>
      <div className="grid">
        {day.map((f) => {
          const c = counts.find((x) => x.dimensionValue === f.dimensionValue);
          const share = total ? Math.round((f.valueNumeric / total.valueNumeric) * 10000) : 0;
          return (
            <div className="card" key={f.dimensionValue}>
              <Figure
                label={`booking_value_by_source ${f.dimensionValue} (count ${c?.valueNumeric ?? 0}, ${share} bps)`}
                value={toDisplay(fromCents(f.valueNumeric))}
                provenance={provenanceOf(f)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
