import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

export default async function StatusPage() {
  const db = await getDb();
  const facts = await activeFacts(db, { measureKey: "appt_value_by_status" });
  const counts = await activeFacts(db, { measureKey: "appt_count_by_status" });
  const day = facts.filter((f) => f.businessDate === "2026-08-19" && f.dimensionType === "status");
  const closed = day.find((f) => f.dimensionValue === "closed");
  const cancelled = day.find((f) => f.dimensionValue === "cancelled");
  return (
    <>
      <h1>Status mix</h1>
      <p className="lede">D3 / 1253 · service_date. Cancellation value is the operationally interesting number.</p>
      <div className="grid">
        {day.map((f) => {
          const c = counts.find((x) => x.dimensionValue === f.dimensionValue && x.businessDate === f.businessDate);
          return (
            <div className="card" key={f.dimensionValue}>
              <Figure
                label={`appt_value_by_status ${f.dimensionValue} (n=${c?.valueNumeric ?? "?"})`}
                value={toDisplay(fromCents(f.valueNumeric))}
                provenance={provenanceOf(f)}
              />
            </div>
          );
        })}
      </div>
      {closed && cancelled ? (
        <p className="notice">
          {cancelled.valueNumeric / 100} cancelled dollars against {closed.valueNumeric / 100} closed. That ratio is a
          fact about this report, not a yield recommendation.
        </p>
      ) : null}
    </>
  );
}
