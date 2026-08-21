import { MEASURE_DEFS } from "@/lib/measures/registry";
import type { Provenance } from "@/lib/measures/types";

/**
 * Provenance chip (design spec §2.3) — the I4 mechanism. Every displayed
 * number is traceable to report_code, business_date, pulled_at and
 * ingest_run_id. The full provenance lives in the `title` attribute (kept
 * verbatim for inspectability) AND in a zero-JS CSS hover/focus tooltip
 * listing source / report / measure / date basis / business date /
 * pulled at / ingest run. Date basis rides along for I6.
 */
export function ProvenanceChip(props: {
  provenance: Provenance;
  /** accent variant for booking-date (loud) surfaces */
  accent?: boolean;
  /** trigger text: a short id (`D1 · 1421`) or the word `provenance` */
  children?: React.ReactNode;
}) {
  const { provenance } = props;
  const dateBasis = MEASURE_DEFS[provenance.measureKey].dateBasis;
  const title = [
    `measure ${provenance.measureKey}`,
    `report ${provenance.reportCode ?? "none"}`,
    `business date ${provenance.businessDate}`,
    `pulled ${provenance.pulledAt || "unknown"}`,
    `ingest ${provenance.ingestRunId}`,
    `basis ${dateBasis}`,
  ].join(" · ");
  const rows: [string, string][] = [
    ["source", provenance.sourceKey],
    ["report", provenance.reportCode ?? "none"],
    ["measure", provenance.measureKey],
    ["date basis", dateBasis.replace(/_/g, " ")],
    ["business date", provenance.businessDate],
    ["pulled at", provenance.pulledAt || "unknown"],
    ["ingest run", provenance.ingestRunId],
  ];
  return (
    <span
      className={props.accent ? "prov prov-accent" : "prov"}
      data-provenance="true"
      title={title}
      tabIndex={0}
    >
      {props.children ?? `${provenance.sourceKey} · ${provenance.reportCode ?? "no report"}`}
      <span className="prov-tip" role="tooltip">
        <span className="prov-tip-head">Provenance</span>
        {rows.map(([k, v]) => (
          <span className="prov-row" key={k}>
            <span className="prov-k">{k}</span>
            <span className="prov-v">{v}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
