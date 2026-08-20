import type { ChartPoint } from "@/lib/charts/types";
import type { DateBasis, MeasureKey } from "@/lib/measures/registry";

export function Spark(props: {
  dateBasis: DateBasis;
  measureKey: MeasureKey;
  points: ChartPoint[];
  peakX?: string;
}) {
  const nums = props.points.map((p) => p.y).filter((y): y is number => y !== null);
  const max = Math.max(...nums, 1);
  return (
    <div className="spark" data-date-basis={props.dateBasis} data-measure-key={props.measureKey}>
      <div className="meta">
        date basis: <strong>{props.dateBasis}</strong> · measure: <strong>{props.measureKey}</strong>
      </div>
      <div className="bars">
        {props.points.map((p) => {
          const h = p.y === null ? 0 : Math.round((p.y / max) * 80);
          return (
            <div key={p.x} className="bar-col">
              <div
                className={`bar ${p.y === null ? "gap" : ""} ${props.peakX === p.x ? "peak" : ""}`}
                style={{ height: p.y === null ? 4 : h }}
                title={p.y === null ? `${p.x}: not available` : `${p.x}: ${p.y}`}
              />
              <span>{p.x}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
