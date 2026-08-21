import type { DateBasis } from "@/lib/measures/registry";
import type { Provenance } from "@/lib/measures/types";
import { DateBasisBadge } from "./DateBasisBadge";
import { ProvenanceChip } from "./ProvenanceChip";
import { StatusBadge, type StatusKind } from "./StatusBadge";

export type FigureStatus = {
  kind: StatusKind;
  /** label override, e.g. "formula unknown", "no records", "totals only" */
  label?: string;
  /** explanatory note rendered under the value */
  note?: string;
};

/**
 * Stat-tile figure (design spec §2.6). Value is a pre-formatted string
 * (Money stays integer cents upstream). Every figure carries provenance
 * (I4) via the required `provenance` prop and pairs
 * data-figure/data-provenance. Backward compatible: the legacy
 * `unvalidated` string prop maps to status {kind:"unvalidated", note}.
 */
export function Figure(props: {
  label: string;
  value: string;
  provenance: Provenance;
  unvalidated?: string;
  sub?: string;
  dateBasis?: DateBasis;
  status?: FigureStatus;
  /** short trigger text for the provenance chip, e.g. "D1 · 1421" */
  provText?: string;
}) {
  if (/^revenue$/i.test(props.label) || /^total revenue$/i.test(props.label) || /^total sales$/i.test(props.label)) {
    throw new Error("I2: bare revenue label is forbidden");
  }
  const status: FigureStatus | undefined =
    props.status ?? (props.unvalidated ? { kind: "unvalidated", note: props.unvalidated } : undefined);
  const valueClass =
    status?.kind === "unvalidated"
      ? "stat-value figure-value stat-value--unvalidated"
      : status?.kind === "insufficient" || status?.kind === "no-delivery"
        ? "stat-value figure-value stat-value--muted"
        : "stat-value figure-value";
  return (
    <span className="stat figure" data-figure="true" data-measure-key={props.provenance.measureKey}>
      <span className="stat-label-row">
        <span className="stat-label figure-label">{props.label}</span>
        {status ? <StatusBadge kind={status.kind} label={status.label} /> : null}
      </span>
      <strong className={valueClass}>{props.value}</strong>
      {props.sub ? <span className="stat-sub">{props.sub}</span> : null}
      <span className="stat-meta">
        {props.dateBasis ? <DateBasisBadge basis={props.dateBasis} /> : null}
        <ProvenanceChip provenance={props.provenance} accent={props.dateBasis === "booking_date"}>
          {props.provText}
        </ProvenanceChip>
      </span>
      {status?.note ? <span className="stat-note warn">{status.note}</span> : null}
    </span>
  );
}
