import type { ChartPoint } from "@/lib/charts/types";
import { MEASURE_DEFS, type DateBasis, type MeasureKey } from "@/lib/measures/registry";
import type { Provenance } from "@/lib/measures/types";
import { DateBasisBadge } from "./DateBasisBadge";
import { ProvenanceChip } from "./ProvenanceChip";

/**
 * Server-rendered bar chart (design spec §2.7). No chart library.
 * - null points render as hatched 6px gap stubs with a reason title,
 *   never a zero-height bar, and are excluded from the max (I5);
 * - optional paired value series must share source, grain and date basis
 *   with the count series (I2 — asserted at render);
 * - the meta row carries the date-basis badge (I6) and, when provided,
 *   a provenance chip (I4).
 * Props are backward compatible with the previous Spark.
 */
export function Spark(props: {
  dateBasis: DateBasis;
  measureKey: MeasureKey;
  points: ChartPoint[];
  peakX?: string;
  /** optional paired series (e.g. value alongside count) */
  valuePoints?: ChartPoint[];
  /** measure key of the paired series — required when valuePoints given */
  valueMeasureKey?: MeasureKey;
  /** provenance chip in the meta row (I4) */
  provenance?: Provenance;
  /** flat dashed reference band, pct of chart height (coverage) */
  band?: { pct: number; label: string };
  /** chart column area height in px (default 150; artboards use 230) */
  height?: number;
  /** render as a single flex strip (daily window) instead of a grid */
  strip?: boolean;
  legend?: boolean;
}) {
  const def = MEASURE_DEFS[props.measureKey];
  if (props.valuePoints) {
    const vKey = props.valueMeasureKey;
    if (!vKey) {
      throw new Error("I2: valuePoints requires valueMeasureKey");
    }
    const vDef = MEASURE_DEFS[vKey];
    if (vDef.dateBasis !== def.dateBasis || vDef.grain !== def.grain || vDef.sourceKey !== def.sourceKey) {
      throw new Error(
        `I2: paired series ${vKey} does not share source/grain/date basis with ${props.measureKey} — cross-source series may not be drawn together`,
      );
    }
  }

  const nums = props.points.map((p) => p.y).filter((y): y is number => y !== null);
  const max = Math.max(...nums, 1);
  const valueByX = new Map((props.valuePoints ?? []).map((p) => [p.x, p.y] as const));
  const vNums = (props.valuePoints ?? []).map((p) => p.y).filter((y): y is number => y !== null);
  const vMax = Math.max(...vNums, 1);
  const height = props.height ?? 150;
  const paired = Boolean(props.valuePoints);

  return (
    <div className="spark chart--bare" data-date-basis={props.dateBasis} data-measure-key={props.measureKey}>
      {props.legend ? (
        <div className="chart-legend" style={{ marginBottom: 12 }}>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--count" /> count
          </span>
          {paired ? (
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--value" /> value
            </span>
          ) : null}
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--gap" /> no delivery
          </span>
        </div>
      ) : null}
      <div
        className={props.strip ? "chart-cols chart-cols--strip" : "chart-cols"}
        style={
          props.strip
            ? { height }
            : { height, gridTemplateColumns: `repeat(${props.points.length}, 1fr)` }
        }
      >
        {props.band ? (
          <>
            <div className="chart-band" style={{ bottom: `${props.band.pct}%` }} />
            <div className="chart-band-label" style={{ bottom: `calc(${props.band.pct}% + 4px)` }}>
              {props.band.label}
            </div>
          </>
        ) : null}
        {props.points.map((p) => {
          const isPeak = props.peakX === p.x;
          const vy = valueByX.get(p.x) ?? null;
          return (
            <div key={p.x} className={`chart-col${isPeak ? " chart-col--peak" : ""}`}>
              {isPeak ? <span className="peak-caption">peak</span> : null}
              <div className="chart-colbars">
                {p.y === null ? (
                  <div className="bar-gap" title={`${p.x}: not available`} />
                ) : (
                  <div
                    className="bar-count"
                    style={{ height: `${Math.max(Math.round((p.y / max) * 100), 1)}%` }}
                    title={`${p.x}: ${p.y}`}
                  />
                )}
                {paired ? (
                  vy === null ? (
                    <div className="bar-gap" title={`${p.x}: not available`} />
                  ) : (
                    <div
                      className="bar-value"
                      style={{ height: `${Math.max(Math.round((vy / vMax) * 100), 1)}%` }}
                      title={`${p.x}: ${vy}`}
                    />
                  )
                ) : null}
              </div>
              <span className="chart-axis-label">{p.x}</span>
            </div>
          );
        })}
      </div>
      <div className="chart-meta meta">
        <DateBasisBadge basis={props.dateBasis} />
        <span className="chart-measure">
          measure: <strong>{props.measureKey}</strong>
          {props.valueMeasureKey ? (
            <>
              {" + "}
              <strong>{props.valueMeasureKey}</strong>
            </>
          ) : null}
        </span>
        {props.provenance ? <ProvenanceChip provenance={props.provenance} /> : null}
      </div>
    </div>
  );
}
