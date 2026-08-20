import type { DateBasisOf, GrainOf, MeasureKey, UnitOf } from "./registry";

declare const measureBrand: unique symbol;

export type Provenance = {
  reportCode: string | null;
  businessDate: string;
  pulledAt: string;
  ingestRunId: string;
  measureKey: MeasureKey;
  sourceKey: string;
};

export type Measure<K extends MeasureKey> = {
  readonly [measureBrand]: K;
  readonly key: K;
  readonly value: number;
  readonly grain: GrainOf<K>;
  readonly dateBasis: DateBasisOf<K>;
  readonly unit: UnitOf<K>;
  readonly provenance: Provenance;
};

export function measure<K extends MeasureKey>(input: {
  key: K;
  value: number;
  grain: GrainOf<K>;
  dateBasis: DateBasisOf<K>;
  unit: UnitOf<K>;
  provenance: Provenance;
}): Measure<K> {
  return {
    key: input.key,
    value: input.value,
    grain: input.grain,
    dateBasis: input.dateBasis,
    unit: input.unit,
    provenance: input.provenance,
  } as Measure<K>;
}
