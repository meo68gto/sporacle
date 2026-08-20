import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

export default async function TurnawayPage() {
  const db = await getDb();
  const counts = await activeFacts(db, { measureKey: "turnaway_count" });
  const values = await activeFacts(db, { measureKey: "turnaway_value" });
  const n = counts.find((f) => f.isTotalRow);
  const v = values.find((f) => f.isTotalRow);
  return (
    <>
      <h1>Turnaway</h1>
      <p className="notice">
        Insufficient data to characterize turnaway. n=1 is not a pattern. The 100% &quot;Price of Service&quot; share is an
        artifact of a single record — no percentage visualization is drawn.
      </p>
      {n && v ? (
        <div className="card">
          <Figure
            label={`turnaway_count ${n.valueNumeric} · turnaway_value`}
            value={toDisplay(fromCents(v.valueNumeric))}
            provenance={provenanceOf(v)}
          />
        </div>
      ) : (
        <p>Not available.</p>
      )}
    </>
  );
}
