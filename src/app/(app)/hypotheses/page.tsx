import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/runtime";
import { reconciliationHypothesis } from "@/db/schema";
import { activeFacts } from "@/lib/queries/facts";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { fromCents, toDisplay } from "@/lib/money";
import { latestDeliveredDay } from "@/lib/business-day";
import { addHypothesisAction, promoteAction } from "./actions";

/**
 * Hypothesis board (design spec §3.3, CLAUDE.md §5). A hypothesis is a
 * proposed explanation, visible as unconfirmed, affecting no computation.
 * Promotion to a definition requires an admin signature and is a
 * migration-grade act — nothing is promoted by arithmetic alone, however
 * clean the arithmetic (H4). The sign-off sheet renders via `?sheet=` to
 * stay a Server Component.
 */

const HEADING_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
};

// Presentation titles and card order for the seeded hypotheses; user-added
// hypotheses fall back to their id and proposer.
const TITLES: Record<string, string> = {
  h4: "the narrowest measure",
  h1: "different date basis",
  h2: "POS wider than appointments",
  h3: "services outnumber appointments",
  h5: "the fill denominator",
  h6: "a third denominator",
};
const ORDER = ["h4", "h1", "h2", "h3", "h5", "h6"];

const SHEET_DEFINITIONS: Record<string, string> = {
  h4: "settled_appointment_value = appt_value_by_status where status = closed",
};

type HypRow = typeof reconciliationHypothesis.$inferSelect;

function cardBadge(h: HypRow) {
  if (h.status === "promoted") return <span className="st st-open">promoted</span>;
  if (h.status === "rejected") return <span className="st st-insufficient">rejected</span>;
  if (h.id === "h5") return <StatusBadge kind="unvalidated" label="unvalidated figure" />;
  if (h.id === "h6") return <StatusBadge kind="unvalidated" label="formula unknown" />;
  if (h.id === "h4")
    return (
      <span className="st st-notyet" style={{ borderColor: "var(--color-accent-500)" }}>
        open · strongest
      </span>
    );
  return (
    <span className="st" style={{ color: "var(--color-neutral-700)", border: "1px solid var(--color-neutral-300)" }}>
      open
    </span>
  );
}

function money(cents: number): string {
  return toDisplay(fromCents(cents)).replace("$", "");
}

export default async function HypothesesPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await db.select().from(reconciliationHypothesis);

  const counts = {
    open: rows.filter((h) => h.status === "open").length,
    promoted: rows.filter((h) => h.status === "promoted").length,
    rejected: rows.filter((h) => h.status === "rejected").length,
  };

  const ordered = [...rows].sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.id.localeCompare(b.id);
  });

  // H4's identity exhibit — three delivered fact values shown side by side.
  // This is a display-only annotation of the hypothesis's arithmetic claim,
  // not Measure arithmetic feeding any computation (I2, CLAUDE.md §5).
  const all = await activeFacts(db);
  // I5 — shared derivation (same rule addHypothesisAction uses): the exhibit's
  // day is the latest one D1 delivered a total row for, never hardcoded.
  const day = latestDeliveredDay(all, { measureKeys: ["appt_value_by_hour"], totalRowsOnly: true });
  const onDay = day ? all.filter((f) => f.businessDate === day) : [];
  const d3closed = onDay.find((f) => f.measureKey === "appt_value_by_status" && f.dimensionValue === "closed");
  const d3booked = onDay.find((f) => f.measureKey === "appt_value_by_status" && f.dimensionValue === "booked");
  const d1total = onDay.find((f) => f.measureKey === "appt_value_by_hour" && f.isTotalRow);
  const identityHolds =
    d3closed && d3booked && d1total && d3closed.valueNumeric + d3booked.valueNumeric === d1total.valueNumeric;

  const sheetFor = sp.sheet ? rows.find((h) => h.id === sp.sheet && h.status === "open") : undefined;
  const isAdmin = can(user, "promote_hypothesis");

  return (
    <>
      <PageHeader
        kicker="Reconciliation"
        title="Hypothesis board"
        lede="Each card proposes one explanation for the five-way money divergence. A hypothesis affects no computation. Promotion requires an admin signature — nothing is promoted by arithmetic alone."
        right={
          <>
            <div className="page-header-stat-value page-header-stat-value--lg">
              {counts.open} / {counts.promoted} / {counts.rejected}
            </div>
            <div className="page-header-stat-label">open · promoted · rejected</div>
          </>
        }
      />

      <div className="card-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {ordered.map((h) => {
          const strongest = h.id === "h4";
          return (
            <article
              key={h.id}
              className={strongest ? "panel-accent panel-accent--40" : "panel-tinted"}
              style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="stat-label-row">
                <span style={{ ...HEADING_FONT, fontSize: 26 }}>
                  {h.id.toUpperCase()}
                  {TITLES[h.id] ? ` · ${TITLES[h.id]}` : ""}
                </span>
                {cardBadge(h)}
              </div>
              <p style={{ margin: 0 }}>{h.description}</p>
              {strongest && d3closed && d3booked && d1total ? (
                <div className="identity-line">
                  {money(d3closed.valueNumeric)} + {money(d3booked.valueNumeric)}{" "}
                  {identityHolds ? "=" : "≠"} {money(d1total.valueNumeric)}
                </div>
              ) : null}
              <p className="note" style={{ margin: 0 }}>
                <strong>Test that would settle it:</strong> {h.testPlan ?? "unspecified"}
              </p>
              <p className="note" style={{ margin: 0 }}>
                <strong>Missing:</strong>{" "}
                <span className={/blocked/i.test(h.missingData ?? "") ? "status-blocked" : undefined}>
                  {h.missingData ?? "unspecified"}
                </span>
              </p>
              {h.id === "h1" ? (
                <Link className="link-action" href="/health">
                  See the blocked source →
                </Link>
              ) : null}
              {strongest && h.status === "open" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
                  <Link className="btn-outline" href="/hypotheses?sheet=h4" style={{ textDecoration: "none" }}>
                    View sign-off sheet
                  </Link>
                  {!isAdmin ? (
                    <span className="note">Signing is admin-only. You are signed in as {user.role}.</span>
                  ) : null}
                </div>
              ) : null}
              {h.status === "promoted" ? (
                <p className="note" style={{ margin: 0 }}>
                  Promoted to a signed definition — see the audit log for the signature record.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {can(user, "add_hypothesis") ? (
        <form className="panel" action={addHypothesisAction} style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <h2 className="chart-title" style={{ margin: 0 }}>
            Add hypothesis
          </h2>
          <div>
            <label htmlFor="hyp-description">Proposed explanation</label>
            <textarea id="hyp-description" name="description" required rows={3} />
          </div>
          <div>
            <label htmlFor="hyp-test">Test that would settle it</label>
            <input id="hyp-test" name="testPlan" type="text" />
          </div>
          <div>
            <label htmlFor="hyp-missing">Missing data</label>
            <input id="hyp-missing" name="missingData" type="text" />
          </div>
          <div>
            <button type="submit">Save hypothesis</button>
          </div>
        </form>
      ) : null}

      {/* Sign-off sheet (§2.9) — server-rendered via ?sheet= */}
      {sheetFor ? (
        <div className="backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
            <div className="sheet-head">
              <div className="sheet-kicker">Sign-off sheet · promotion is a migration, not a toggle</div>
              <h2 className="sheet-title" id="sheet-title">
                Promotion of {sheetFor.id.toUpperCase()}
              </h2>
            </div>
            <div className="sheet-body">
              <div className="sheet-definition">
                <div className="sheet-definition-line">
                  {SHEET_DEFINITIONS[sheetFor.id] ?? "Definition to be authored at signing."}
                </div>
                <p className="note" style={{ margin: "10px 0 0" }}>
                  {sheetFor.id === "h4"
                    ? "Excludes the cancelled and still-booked appointments by definition — that exclusion is the human choice being signed, not a computed fact."
                    : sheetFor.description}
                </p>
              </div>
              <div className="signature-row">
                <span className="stat-label">Signed by</span>
                <span className="signature-rule" />
              </div>
              <div className="signature-row">
                <span className="stat-label">Date</span>
                <span className="signature-rule" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 26,
                  flexWrap: "wrap",
                }}
              >
                <Link className="btn-quiet" href="/hypotheses" style={{ textDecoration: "none" }}>
                  Close
                </Link>
                {isAdmin ? (
                  <form action={promoteAction} style={{ margin: 0 }}>
                    <input type="hidden" name="id" value={sheetFor.id} />
                    <button type="submit">Sign and promote</button>
                  </form>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                    <span className="btn-locked">Sign and promote</span>
                    <span className="note">Signing is admin-only. You are signed in as {user.role}.</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
