/**
 * Hairline stat grid (design spec §2.6): a 1px gap over the divider color
 * draws the grid lines — no per-cell borders.
 */
export function StatGrid(props: { columns: number; compact?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`stat-grid${props.compact ? " stat-grid--compact" : ""}`}
      style={{ gridTemplateColumns: `repeat(${props.columns}, 1fr)` }}
    >
      {props.children}
    </div>
  );
}
