import type { Provenance } from "@/lib/measures/types";

export function ProvenanceChip({ provenance }: { provenance: Provenance }) {
  const title = [
    `measure ${provenance.measureKey}`,
    `report ${provenance.reportCode ?? "none"}`,
    `business date ${provenance.businessDate}`,
    `pulled ${provenance.pulledAt || "unknown"}`,
    `ingest ${provenance.ingestRunId}`,
  ].join(" · ");
  return (
    <span className="chip" data-provenance="true" title={title} tabIndex={0}>
      {provenance.sourceKey} {provenance.reportCode ?? ""} {provenance.businessDate}
    </span>
  );
}
