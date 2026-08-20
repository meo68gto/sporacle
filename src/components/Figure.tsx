import type { Provenance } from "@/lib/measures/types";
import { ProvenanceChip } from "./ProvenanceChip";

export function Figure(props: {
  label: string;
  value: string;
  provenance: Provenance;
  unvalidated?: string;
}) {
  if (/^revenue$/i.test(props.label) || /^total revenue$/i.test(props.label) || /^total sales$/i.test(props.label)) {
    throw new Error("I2: bare revenue label is forbidden");
  }
  return (
    <span className="figure" data-figure="true" data-measure-key={props.provenance.measureKey}>
      <span className="figure-label">{props.label}</span>
      <strong className="figure-value">{props.value}</strong>
      <ProvenanceChip provenance={props.provenance} />
      {props.unvalidated ? <span className="warn">{props.unvalidated}</span> : null}
    </span>
  );
}
