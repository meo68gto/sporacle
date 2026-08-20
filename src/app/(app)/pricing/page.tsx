import { getDb } from "@/lib/runtime";
import { allGatesPass, evaluateGates } from "@/lib/gates";
import { logLogElasticity, recommendedPriceCents, SYNTHETIC_ELASTICITY_FIXTURE } from "@/lib/pricing/model";

export default async function PricingPage() {
  const db = await getDb();
  const gates = await evaluateGates(db);
  const ready = allGatesPass(gates);
  if (!ready) {
    return (
      <>
        <h1>Pricing workbench</h1>
        <p className="notice">
          No elasticity estimate and no price recommendation. Forcing a number requires a code change, not a toggle.
        </p>
        <p>
          <a href="/gates">See sufficiency gates</a> for what would turn this page on.
        </p>
        <ul>
          {gates.filter((g) => !g.passing).map((g) => (
            <li key={g.id}>
              {g.id}: {g.remedy}
            </li>
          ))}
        </ul>
      </>
    );
  }
  const elasticity = logLogElasticity(SYNTHETIC_ELASTICITY_FIXTURE);
  const rec = elasticity === null ? null : recommendedPriceCents(18000, elasticity);
  return (
    <>
      <h1>Pricing workbench</h1>
      <p className="meta">Gates passed. Model output is still labeled as model output, not as a Book4Time fact.</p>
      <p data-figure="true" data-measure-key="model_elasticity">
        Elasticity {elasticity ?? "n/a"}
      </p>
      <p data-figure="true" data-measure-key="model_price_recommendation">
        Recommendation {rec ?? "n/a"} cents
      </p>
    </>
  );
}
