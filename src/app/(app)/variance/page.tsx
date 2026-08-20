import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts } from "@/lib/queries/facts";
import { varianceLines } from "@/lib/reconciliation/variance";
import { toDisplay, fromCents } from "@/lib/money";

export default async function VariancePage() {
  const db = await getDb();
  const facts = await activeFacts(db, { businessDate: "2026-08-19" });
  const all = await activeFacts(db);
  const lines = varianceLines(all, "2026-08-19");
  return (
    <>
      <h1>Variance ledger</h1>
      <p className="lede">
        These are five different measures for 2026-08-19, not errors. There is no headline total. Do not force.
      </p>
      <div className="grid">
        {lines.map((line) => (
          <div className="card" key={line.measureKey + line.sourceKey}>
            <Figure
              label={`${line.sourceKey} ${line.measureKey} (${line.dateBasis})`}
              value={line.display}
              provenance={line.provenance}
            />
            {line.note ? <p className="meta">{line.note}</p> : null}
          </div>
        ))}
      </div>
      {lines.length >= 2 ? (
        <div className="card">
          <h2>Pairwise deltas (same-day cents, not a reconciliation)</h2>
          <table>
            <thead>
              <tr>
                <th>A</th>
                <th>B</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {lines.flatMap((a, i) =>
                lines.slice(i + 1).map((b) => (
                  <tr key={a.sourceKey + b.sourceKey}>
                    <td>{a.sourceKey}</td>
                    <td>{b.sourceKey}</td>
                    <td>{toDisplay(fromCents(a.valueCents - b.valueCents))}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No facts loaded.</p>
      )}
      <p className="meta">{facts.length} fact rows for the selected day.</p>
    </>
  );
}
