import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/lib/runtime";
import { evaluateGates, type Gate } from "@/lib/gates";

/**
 * Sufficiency gates (design spec §3.9). I9: gates are coded pre-conditions —
 * this screen renders their state and reasons, never a model number.
 * The accordion is server-rendered via the `?open=` query param.
 */

const heading: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
};

/** Denominator each gate's progress track is drawn against (display only). */
const GATE_DENOMINATOR: Record<string, number> = {
  G1_observation_count: 730,
  G2_seasonal_coverage: 24,
  G3_price_variation: 3,
  G4_service_master: 1,
  G5_revenue_definition: 1,
  G6_demand_covariate: 1,
  G7_forward_book: 1,
};

function gateCode(g: Gate): string {
  return g.id.split("_")[0] ?? g.id;
}

function gatePct(g: Gate): number {
  if (g.passing) return 100;
  const denom = GATE_DENOMINATOR[g.id] ?? 1;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((g.currentValue / denom) * 100)));
}

export default async function GatesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const sp = await searchParams;
  const db = await getDb();
  const gates = await evaluateGates(db);
  const openCount = gates.filter((g) => g.passing).length;
  const expanded = gates.find((g) => g.id === sp.open)?.id ?? null;

  return (
    <>
      <PageHeader
        kicker="Progress toward a pricing capability"
        title="Sufficiency gates"
        lede="Seven conditions must hold before this system will speak about price. Each one is a coded pre-condition, computed from the database — never a toggle — and each will open itself the moment the data arrives."
      />

      <section className="panel-tinted" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 36, alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ ...heading, fontSize: 64, lineHeight: 1 }}>
            {openCount}
            <span style={{ color: "var(--color-neutral-400)" }}>/{gates.length}</span>
          </div>
          <div className="page-kicker" style={{ marginTop: 8 }}>
            gates open
          </div>
        </div>
        <div>
          <div className="gate-meter" style={{ marginBottom: 14 }}>
            {gates.map((g) => (
              <span key={g.id} className={`gate-meter-cell${g.passing ? " gate-meter-cell--open" : ""}`} />
            ))}
          </div>
          <p className="note" style={{ margin: 0 }}>
            Two of the seven are within reach this quarter: G5 needs one signature, G4 needs one file
            drop. The oracle is not withholding an answer — it does not have one yet.
          </p>
        </div>
      </section>

      <div className="table-wrap" style={{ marginBottom: 28 }}>
        {gates.map((g, i) => {
          const isOpen = expanded === g.id;
          return (
            <article key={g.id} data-gate={g.id} data-passing={String(g.passing)} style={i > 0 ? { borderTop: "1px solid var(--color-divider)" } : undefined}>
              <a
                href={isOpen ? "/gates" : `/gates?open=${g.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 24,
                  alignItems: "center",
                  padding: "18px 24px",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--color-neutral-600)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 28,
                  }}
                >
                  {gateCode(g)}
                </span>
                <span style={{ ...heading, fontSize: 22, lineHeight: 1.2 }}>{g.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="gate-track">
                    <span className="gate-fill" style={{ width: `${gatePct(g)}%` }} />
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--color-neutral-700)",
                    }}
                  >
                    {g.current}
                  </span>
                </span>
                <span className={`st ${g.passing ? "st-open" : "st-notyet"}`}>{g.passing ? "open" : "not yet"}</span>
              </a>
              {isOpen ? (
                <div
                  style={{
                    background: "var(--color-neutral-100)",
                    borderTop: "1px solid var(--color-divider)",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 28,
                    padding: "18px 24px 20px",
                  }}
                >
                  <div>
                    <div className="page-kicker" style={{ marginBottom: 6 }}>
                      Threshold
                    </div>
                    <p className="note" style={{ margin: 0 }}>
                      {g.threshold}
                    </p>
                  </div>
                  <div>
                    <div className="page-kicker" style={{ marginBottom: 6 }}>
                      What would open it
                    </div>
                    <p className="note" style={{ margin: 0 }}>
                      {g.remedy}
                    </p>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="closing-line">An oracle that speaks before it knows is just a fortune teller.</p>
    </>
  );
}
