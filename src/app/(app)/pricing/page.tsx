import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/runtime";
import { allGatesPass, evaluateGates, type Gate } from "@/lib/gates";
import { logLogElasticity, recommendedPriceCents, SYNTHETIC_ELASTICITY_FIXTURE } from "@/lib/pricing/model";

/**
 * Pricing workbench (design spec §3.10). I9: the gate-failed state renders
 * the reasons the gates fail — never a number. There is no override in the
 * interface; forcing a number here would be a code change and an audit
 * record.
 */

const heading: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
};

/** Short reading per gate, derived from the same evaluation as /gates. */
function shortReading(g: Gate): string {
  switch (g.id) {
    case "G1_observation_count":
      return `${g.currentValue} of 730 days`;
    case "G2_seasonal_coverage":
      return `${g.currentValue} of 24 months`;
    case "G3_price_variation":
      return `${g.currentValue} of 3 prices`;
    case "G4_service_master":
    case "G6_demand_covariate":
      return g.currentValue > 0 ? "configured" : "absent";
    case "G5_revenue_definition":
      return g.passing ? `${g.currentValue} promoted` : "unsigned";
    case "G7_forward_book":
      return g.passing ? "active" : "blocked upstream";
    default:
      return g.current;
  }
}

function gateCode(g: Gate): string {
  return g.id.split("_")[0] ?? g.id;
}

export default async function PricingPage() {
  const db = await getDb();
  const gates = await evaluateGates(db);
  const ready = allGatesPass(gates);
  const openCount = gates.filter((g) => g.passing).length;

  if (!ready) {
    const g4 = gates.find((g) => g.id === "G4_service_master");
    const g5 = gates.find((g) => g.id === "G5_revenue_definition");
    return (
      <>
        <PageHeader
          kicker={`Locked · ${openCount} of ${gates.length} gates open`}
          title="Pricing workbench"
          lede="When the gates open, this screen will estimate elasticity per service and propose a price band with a confidence interval. Today it shows nothing, because a confident wrong number is worse than no number — a real pricing decision hangs off it."
        />

        <section className="placard-locked" style={{ marginBottom: 28 }}>
          <h2 className="placard-locked-title">No estimate. No recommendation. No preview.</h2>
          <p className="note" style={{ maxWidth: "56ch", margin: "12px auto 0" }}>
            No elasticity estimate and no price recommendation exists on this page. Turning it on
            requires the data below, not a setting. There is no override in the interface — forcing a
            number here would be a code change and an audit record.
          </p>
        </section>

        <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <section className="panel">
            <h2 style={{ ...heading, fontSize: 22, margin: "0 0 10px" }}>What blocks it</h2>
            <div>
              {gates.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 16,
                    padding: "11px 0",
                    borderBottom: "1px solid var(--color-divider)",
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--color-neutral-600)",
                        marginRight: 10,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {gateCode(g)}
                    </span>
                    {g.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontVariantNumeric: "tabular-nums",
                      color: g.passing
                        ? "var(--color-neutral-700)"
                        : g.id === "G7_forward_book"
                          ? "var(--color-accent-800)"
                          : "var(--color-neutral-700)",
                    }}
                  >
                    {shortReading(g)}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ margin: "16px 0 0" }}>
              <a className="link-action" href="/gates">
                Open the gates screen →
              </a>
            </p>
          </section>

          <section className="panel">
            <h2 style={{ ...heading, fontSize: 22, margin: "0 0 14px" }}>The two nearest signatures</h2>
            {g5 && !g5.passing ? (
              <div className="callout" style={{ marginBottom: 18 }}>
                <h3 style={{ ...heading, fontSize: 20, margin: "0 0 6px" }}>G5 · one admin signature</h3>
                <p className="note" style={{ margin: 0 }}>
                  H4 proposes the narrowest measure — closed appointment value — as the settled
                  definition. An admin signature promotes it, and G5 opens. Nothing is promoted by
                  arithmetic alone. <a className="link-action" href="/hypotheses">Read H4 →</a>
                </p>
              </div>
            ) : null}
            {g4 && !g4.passing ? (
              <div className="callout">
                <h3 style={{ ...heading, fontSize: 20, margin: "0 0 6px" }}>G4 · one file drop</h3>
                <p className="note" style={{ margin: 0 }}>
                  One <code>b4t_service_price_master</code> envelope through Veluma — or the file-drop
                  fallback — makes &ldquo;is this service mispriced?&rdquo; answerable at all, and G4
                  opens.
                </p>
              </div>
            ) : null}
            {(!g5 || g5.passing) && (!g4 || g4.passing) ? (
              <p className="note" style={{ margin: 0 }}>
                The nearest signatures are done. The remaining gates need time-series history, not a
                signature — see the gates screen for what is still accruing.
              </p>
            ) : null}
          </section>
        </div>
      </>
    );
  }

  const elasticity = logLogElasticity(SYNTHETIC_ELASTICITY_FIXTURE);
  const rec = elasticity === null ? null : recommendedPriceCents(18000, elasticity);
  return (
    <>
      <PageHeader
        kicker={`Open · ${openCount} of ${gates.length} gates open`}
        title="Pricing workbench"
        lede="All seven gates pass. Model output is still labeled as model output — never as a Book4Time fact."
      />
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div>
          <span className="stat-label">model_elasticity</span>
          <p data-figure="true" data-measure-key="model_elasticity" style={{ ...heading, fontSize: 40, margin: "6px 0 2px" }}>
            {elasticity ?? "Not available"}
          </p>
          <span className="stat-sub">log-log elasticity · model output, not a report claim</span>
        </div>
        <div>
          <span className="stat-label">model_price_recommendation</span>
          <p data-figure="true" data-measure-key="model_price_recommendation" style={{ ...heading, fontSize: 40, margin: "6px 0 2px" }}>
            {rec === null ? "Not available" : `${rec} cents`}
          </p>
          <span className="stat-sub">recommended list price · integer cents · model output</span>
        </div>
      </div>
    </>
  );
}
