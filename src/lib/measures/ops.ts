import type { Measure } from "./types";
import { MEASURE_DEFS, type MeasureKey } from "./registry";
import { measure } from "./types";

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;
type OneKey<K extends MeasureKey> = IsUnion<K> extends true ? never : K;

export function sum<K extends MeasureKey>(
  xs: readonly [Measure<OneKey<K>>, ...Measure<OneKey<K>>[]],
): Measure<OneKey<K>> {
  const first = xs[0];
  const total = xs.reduce((acc, item) => acc + item.value, 0);
  return measure({
    key: first.key,
    value: total,
    grain: first.grain,
    dateBasis: first.dateBasis,
    unit: first.unit,
    provenance: first.provenance,
  });
}

export function avg<K extends MeasureKey>(
  xs: readonly [Measure<OneKey<K>>, ...Measure<OneKey<K>>[]],
): Measure<OneKey<K>> {
  const total = sum(xs);
  return measure({
    key: total.key,
    value: Math.round(total.value / xs.length),
    grain: total.grain,
    dateBasis: total.dateBasis,
    unit: total.unit,
    provenance: total.provenance,
  });
}

export function ratio<K extends MeasureKey>(numerator: Measure<K>, denominator: Measure<K>): number {
  if (denominator.value === 0) return 0;
  return numerator.value / denominator.value;
}

export function assertHomogeneous<K extends MeasureKey>(xs: readonly Measure<K>[]): void {
  const first = xs[0];
  if (!first) return;
  for (const item of xs) {
    if (item.key !== first.key) throw new Error("I2: mixed measure keys");
    if (item.grain !== first.grain) throw new Error("I2: mixed grains");
    if (item.dateBasis !== first.dateBasis) throw new Error("I2: mixed date basis");
  }
}

export function defOf<K extends MeasureKey>(key: K) {
  return MEASURE_DEFS[key];
}
