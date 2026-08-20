import type { DateBasis, MeasureKey } from "@/lib/measures/registry";

export type ChartPoint = {
  x: string;
  y: number | null;
};

export type ChartSeries<B extends DateBasis, K extends MeasureKey> = {
  dateBasis: B;
  measureKey: K;
  points: ChartPoint[];
};

export function makeChartSeries<B extends DateBasis, K extends MeasureKey>(
  dateBasis: B,
  measureKey: K,
  points: ChartPoint[],
): ChartSeries<B, K> {
  return { dateBasis, measureKey, points };
}

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;
type OneBasis<B extends DateBasis> = IsUnion<B> extends true ? never : B;

export function ChartAxis<B extends DateBasis>(props: {
  dateBasis: OneBasis<B>;
  series: readonly ChartSeries<OneBasis<B>, MeasureKey>[];
}): null {
  void props;
  return null;
}
